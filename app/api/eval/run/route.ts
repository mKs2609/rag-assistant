import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, geminiErrorMessage } from '@/lib/gemini'

const EVAL_RATE_LIMIT_MAX = 5
const EVAL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: [text], model: 'voyage-3.5', input_type: 'query' }),
  })
  if (!res.ok) throw new Error(`Voyage API error (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.data[0].embedding
}

function significantWords(text: string): Set<string> {
  const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to',
    'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'and', 'or',
  ])
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // optionally run a single question
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

  const { data: questions } = await query 

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'No evaluation questions yet. Add some first.' }, { status: 400 })
  }

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

  const results = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    // avoid voyage free tier rate limit
    if (i > 0) {
      await sleep(1200)
    }
    try {
      const queryEmbedding = await embedQuery(q.question)
      const { data: matches } = await supabase.rpc('match_document_chunks', {
        query_embedding: queryEmbedding,
        match_tenant_id: profile.tenant_id,
        match_count: 5,
        filter_document_ids: null,
      })

      const chunks = (matches ?? []) as { document_id: string; content: string }[]
      const retrievedDocIds = chunks.map((m) => m.document_id)
      const retrievalHit = q.expected_document_id
        ? retrievedDocIds.includes(q.expected_document_id)
        : true

      const context = chunks
        .map((m, i) => `[${i + 1}] ${m.content}`)
        .join('\n\n')

      const geminiRes = await callGemini('generateContent', {
        systemInstruction: {
          parts: [{ text: `Answer using only this reference material:\n${context}` }],
        },
        contents: [{ role: 'user', parts: [{ text: q.question }] }],
      })

      // a failed call used to score as a wrong answer
      if (!geminiRes.ok) {
        console.error(`Gemini error (${geminiRes.status}):`, await geminiRes.text())
        throw new Error(geminiErrorMessage(geminiRes.status))
      }

      const geminiData = await geminiRes.json()
      const answer: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      const answerWords = significantWords(answer)
      const expectedKeywords: string[] = q.expected_keywords ?? []
      const keywordsFound = expectedKeywords.filter((kw) => answerWords.has(kw.toLowerCase()))
      const answerCorrect =
        expectedKeywords.length === 0 ? true : keywordsFound.length / expectedKeywords.length >= 0.5

      results.push({
        questionId: q.id,
        question: q.question,
        retrievalHit,
        answerCorrect,
        answer,
        keywordsFound,
        keywordsExpected: expectedKeywords,
      })
    } catch (err) {
      results.push({
        questionId: q.id,
        question: q.question,
        retrievalHit: false,
        answerCorrect: false,
        answer: '',
        error: err instanceof Error ? err.message : 'Evaluation failed for this question',
      })
    }
  }

  // skip questions that errored, they say nothing about retrieval or answer quality
  const scored = results.filter((r) => !('error' in r))
  const retrievalScore = scored.length ? scored.filter((r) => r.retrievalHit).length / scored.length : null
  const answerScore = scored.length ? scored.filter((r) => r.answerCorrect).length / scored.length : null

  return NextResponse.json({ results, retrievalScore, answerScore })
}