import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { data: questions } = await supabase
    .from('eval_questions')
    .select('id, question, expected_document_id, expected_keywords')
    .order('created_at', { ascending: true })

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'No evaluation questions yet. Add some first.' }, { status: 400 })
  }

  const results = []

  for (const q of questions) {
    try {
      const queryEmbedding = await embedQuery(q.question)
      const { data: matches } = await supabase.rpc('match_document_chunks', {
        query_embedding: queryEmbedding,
        match_tenant_id: profile.tenant_id,
        match_count: 5,
        filter_document_ids: null,
      })

      const retrievedDocIds = (matches ?? []).map((m: any) => m.document_id)
      const retrievalHit = q.expected_document_id
        ? retrievedDocIds.includes(q.expected_document_id)
        : true

      const context = (matches ?? [])
        .map((m: any, i: number) => `[${i + 1}] ${m.content}`)
        .join('\n\n')

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: `Answer using only this reference material:\n${context}` }],
            },
            contents: [{ role: 'user', parts: [{ text: q.question }] }],
          }),
        }
      )

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

  const retrievalScore = results.filter((r) => r.retrievalHit).length / results.length
  const answerScore = results.filter((r) => r.answerCorrect).length / results.length

  return NextResponse.json({ results, retrievalScore, answerScore })
}