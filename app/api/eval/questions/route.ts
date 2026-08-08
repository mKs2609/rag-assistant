import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('eval_questions')
    .select('id, question, expected_document_id, expected_keywords, created_at, documents(filename)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { question, expectedDocumentId, expectedKeywords } = await request.json()

  if (!question || typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }

  const keywords = Array.isArray(expectedKeywords)
    ? expectedKeywords.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
    : []

  const { data, error } = await supabase
    .from('eval_questions')
    .insert({
      tenant_id: profile.tenant_id,
      question: question.trim(),
      expected_document_id: expectedDocumentId || null,
      expected_keywords: keywords,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data })
}