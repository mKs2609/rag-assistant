import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { title, pinned, addDocumentIds } = await request.json()

  const updates: { title?: string; pinned?: boolean; document_ids?: string[] } = {}

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    updates.title = title.trim().slice(0, 60)
  }

  if (pinned !== undefined) {
    if (typeof pinned !== 'boolean') {
      return NextResponse.json({ error: 'pinned must be a boolean' }, { status: 400 })
    }
    updates.pinned = pinned
  }

  if (addDocumentIds !== undefined) {
    if (!Array.isArray(addDocumentIds) || addDocumentIds.some((d) => typeof d !== 'string')) {
      return NextResponse.json({ error: 'addDocumentIds must be an array of strings' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('conversations')
      .select('document_ids')
      .eq('id', id)
      .single()

    const current: string[] = existing?.document_ids ?? []
    const merged = Array.from(new Set([...current, ...addDocumentIds]))
    updates.document_ids = merged
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', id)
    .select('document_ids')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, documentIds: updated?.document_ids ?? null })
}