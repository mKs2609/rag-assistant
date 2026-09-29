import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// enough points to see a direction without the chart turning into a smear
const MAX_RUNS = 20

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // row level security also limits this to the caller's workspace
  const { data, error } = await supabase
    .from('eval_runs')
    .select('id, retrieval_accuracy, answer_accuracy, scored_count, skipped_count, created_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_full_run', true)
    .order('created_at', { ascending: false })
    .limit(MAX_RUNS)

  if (error) {
    console.error('Failed to load eval runs:', error.message)
    return NextResponse.json({ error: 'Could not load past runs' }, { status: 500 })
  }

  // oldest first, so the chart reads left to right
  const runs = (data ?? [])
    .slice()
    .reverse()
    .map((run) => ({
      id: run.id,
      retrievalAccuracy: run.retrieval_accuracy === null ? null : Number(run.retrieval_accuracy),
      answerAccuracy: run.answer_accuracy === null ? null : Number(run.answer_accuracy),
      scoredCount: run.scored_count,
      skippedCount: run.skipped_count,
      createdAt: run.created_at,
    }))

  return NextResponse.json({ runs })
}
