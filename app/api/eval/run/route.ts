import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerText, callGemini, geminiErrorMessage, geminiFailure, EVAL_MODEL } from '@/lib/gemini'
import {
  answerIsCorrect,
  keywordsFoundIn,
  retrievalHitFor,
  rotate,
  scoreRun,
  type Outcome,
} from '@/lib/eval'
import { mergeMatches } from '@/lib/retrieval'

// a full set is one gemini call per question, which needs more than the default
export const maxDuration = 300

const EVAL_RATE_LIMIT_MAX = 5
const EVAL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

// every question is embedded in one request. embedding them one at a time meant a set of
// twenty questions made twenty requests, and the free tier allows three a minute, so all but
// the first few failed with 429. voyage accepts up to 128 inputs per request.
const EMBED_BATCH = 128

// nothing stopped this hanging, and a run cannot start until it returns
const EMBED_TIMEOUT_MS = 30_000

// the lite model allows fifteen requests a minute, which it names as "limit: 15" against
// GenerateRequestsPerMinutePerProjectPerModel. an earlier probe stopped at fourteen and
// saw no limit at all, so this was first set to thirty a minute and a real run of 22
// questions was rejected five times. 4.5 seconds is thirteen a minute, under the limit
// with room to spare, and puts a 22 question run at under two minutes.
//
// this is the gap between the starts of two requests, not a pause after each one.
const MODEL_GAP_MS = 4_500

// a retry a second later cannot clear a limit that lasts a minute, and the next question
// is already 6.5s away, which is the better recovery
const MODEL_ATTEMPTS = 1

// a busy model has been seen to hold a request open for 61s. left unbounded, two of those
// spend most of a run's time budget and every question after them goes unscored
const MODEL_TIMEOUT_MS = 25_000

// scored on the lite model, which is named in the results so a reader of the numbers
// knows which model produced them
const SCORING_MODEL = EVAL_MODEL

// the route is allowed 300s. stop before the platform stops us, so the questions that did
// run are still saved and scored instead of the whole run being lost
const TIME_BUDGET_MS = 260_000

// the same number the chat keeps, so the harness scores what the product actually does
const PASSAGES_PER_ANSWER = 6

interface Chunk {
  id: string
  document_id: string
  content: string
}

async function embedQueries(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const batch = texts.slice(start, start + EMBED_BATCH)
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: batch, model: 'voyage-3.5', input_type: 'query' }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Voyage API error (${res.status}): ${await res.text()}`)
    const data = await res.json()
    for (const row of data.data) out.push(row.embedding)
  }
  return out
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  let questionId: string | undefined
  try {
    const body = await request.json()
    questionId = body?.questionId
  } catch {
    // no body, run all questions
  }

  // each run calls voyage and gemini once per question
  const { count: recentRuns } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', 'eval_run')
    .gte('created_at', new Date(Date.now() - EVAL_RATE_LIMIT_WINDOW_MS).toISOString())

  if ((recentRuns ?? 0) >= EVAL_RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: `Rate limit exceeded. You can run up to ${EVAL_RATE_LIMIT_MAX} evaluations every 10 minutes.` },
      { status: 429 }
    )
  }

  let query = supabase
    .from('eval_questions')
    .select('id, question, expected_document_id, expected_keywords')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: true })

  if (questionId) {
    query = query.eq('id', questionId)
  }

  const { data: allQuestions } = await query

  if (!allQuestions || allQuestions.length === 0) {
    return NextResponse.json({ error: 'No evaluation questions yet. Add some first.' }, { status: 400 })
  }

  // the budget gives out before the end of a long set, and working through them in the
  // same order every time meant the last few were never reached. counting past runs and
  // starting that far along gives each question its turn. a single question has no order
  // to rotate, so it is left alone.
  const { count: pastRuns } = await supabase
    .from('eval_runs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .eq('is_full_run', true)

  const questions = questionId ? allQuestions : rotate(allQuestions, pastRuns ?? 0)

  // users can't write audit_logs, so log the run with the service role
  const { error: logError } = await createAdminClient().from('audit_logs').insert({
    tenant_id: profile.tenant_id,
    user_id: user.id,
    action: 'eval_run',
    metadata: { question_count: questions.length, question_id: questionId ?? null },
  })

  if (logError) {
    console.error('Failed to record eval run:', logError.message)
    return NextResponse.json({ error: 'Could not start the evaluation. Please try again.' }, { status: 500 })
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  const results: (Outcome & {
    questionId: string
    question: string
    answer: string
    keywordsFound?: string[]
    keywordsExpected?: string[]
    error?: string
  })[] = []

  // embed everything up front, so the rest of the run makes no further voyage requests
  let embeddings: number[][]
  try {
    embeddings = await embedQueries(questions.map((q) => q.question))
  } catch (err) {
    console.error('Could not embed the evaluation questions:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not embed the questions' },
      { status: 502 }
    )
  }

  const startedAt = Date.now()
  let lastCallStartedAt = 0
  // once the day's allowance is gone every later question gets the same answer, so stop
  // asking rather than spending the rest of the run proving it
  let modelOutOfQuota = false
  let outOfTime = false
  // google's own wait, captured when the quota first ran out, so every remaining question
  // repeats the same real figure rather than a rebuilt guess
  let quotaMessage = ''

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (Date.now() - startedAt > TIME_BUDGET_MS) outOfTime = true

    // searching needs no model, so it is measured on its own and kept whatever follows
    let retrievalHit: boolean | null = null
    let chunks: Chunk[] = []
    let searchError = ''

    // the same two searches the chat runs, merged the same way. scoring the vector search
    // alone measured half the product: hybrid retrieval exists because vector search could
    // not find an exact code, and a harness that skipped the keyword half could never see
    // either the weakness or the fix.
    const [vectorResult, keywordResult] = await Promise.all([
      supabase.rpc('match_document_chunks', {
        query_embedding: embeddings[i],
        match_tenant_id: profile.tenant_id,
        match_count: 5,
        filter_document_ids: null,
      }),
      supabase.rpc('match_document_chunks_keyword', {
        search_query: q.question,
        match_tenant_id: profile.tenant_id,
        match_count: 5,
        filter_document_ids: null,
      }),
    ])

    if (vectorResult.error) {
      // this used to pass silently as "no passages found", which then scored as a miss
      console.error(`Search failed for "${q.question}":`, vectorResult.error.message)
      searchError = 'The search failed for this question, so it could not be scored.'
    } else {
      if (keywordResult.error) console.error('Keyword search failed:', keywordResult.error.message)

      chunks = mergeMatches(
        (vectorResult.data ?? []) as Chunk[],
        (keywordResult.data ?? []) as Chunk[],
        PASSAGES_PER_ANSWER
      )
      retrievalHit = retrievalHitFor(
        q.expected_document_id,
        chunks.map((m) => m.document_id)
      )
    }

    if (modelOutOfQuota || outOfTime || searchError) {
      results.push({
        questionId: q.id,
        question: q.question,
        retrievalHit,
        answerCorrect: null,
        answer: '',
        error:
          searchError ||
          (outOfTime
            ? 'The run reached its time limit before this question. Run it again to score the rest.'
            : quotaMessage),
      })
      continue
    }

    try {
      const context = chunks.map((m, n) => `[${n + 1}] ${m.content}`).join('\n\n')

      // wait only for what is left of the window since the last request started. a call
      // that itself took longer than the window has already done the waiting, and sleeping
      // again on top of it was spending the run's time budget on nothing
      const sinceLastCall = Date.now() - lastCallStartedAt
      if (lastCallStartedAt > 0 && sinceLastCall < MODEL_GAP_MS) {
        await sleep(MODEL_GAP_MS - sinceLastCall)
      }
      lastCallStartedAt = Date.now()

      const geminiRes = await callGemini(
        'generateContent',
        {
          systemInstruction: {
            parts: [{ text: `Answer using only this reference material:\n${context}` }],
          },
          contents: [{ role: 'user', parts: [{ text: q.question }] }],
        },
        { maxAttempts: MODEL_ATTEMPTS, timeoutMs: MODEL_TIMEOUT_MS, model: SCORING_MODEL }
      )

      // a failed call used to score as a wrong answer
      if (!geminiRes.ok) {
        const body = await geminiRes.text()
        console.error(`Gemini error (${geminiRes.status}):`, body)
        const message = geminiErrorMessage(geminiRes.status, body)
        if (geminiFailure(geminiRes.status, body) === 'quota-daily') {
          modelOutOfQuota = true
          quotaMessage = message
        }
        throw new Error(message)
      }

      const answer = answerText(await geminiRes.json())
      const expectedKeywords: string[] = q.expected_keywords ?? []

      results.push({
        questionId: q.id,
        question: q.question,
        retrievalHit,
        answerCorrect: answerIsCorrect(answer, expectedKeywords),
        answer,
        keywordsFound: keywordsFoundIn(answer, expectedKeywords),
        keywordsExpected: expectedKeywords,
      })
    } catch (err) {
      // the retrieval result above still stands, only the answer is unknown
      results.push({
        questionId: q.id,
        question: q.question,
        retrievalHit,
        answerCorrect: null,
        answer: '',
        error: err instanceof Error ? err.message : 'The answer could not be scored.',
      })
    }
  }

  const score = scoreRun(results)

  // kept so the scores can be compared over time instead of vanishing on reload.
  // only a full run goes on the trend, a single question is not comparable with the rest.
  const { error: runError } = await createAdminClient().from('eval_runs').insert({
    tenant_id: profile.tenant_id,
    user_id: user.id,
    retrieval_accuracy: score.retrievalAccuracy,
    answer_accuracy: score.answerAccuracy,
    retrieval_scored_count: score.retrievalScored,
    scored_count: score.answerScored,
    skipped_count: score.total - score.answerScored,
    is_full_run: !questionId,
  })
  if (runError) {
    // the scores are still worth returning, so report the run rather than failing it
    console.error('Failed to record eval run scores:', runError.message)
  }

  return NextResponse.json({
    results,
    retrievalScore: score.retrievalAccuracy,
    answerScore: score.answerAccuracy,
    model: SCORING_MODEL,
  })
}