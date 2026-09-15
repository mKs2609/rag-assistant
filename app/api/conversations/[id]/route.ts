import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// conversations are shared in the workspace, but only the creator or an owner/admin can change them
async function loadConversationAccess(supabase: SupabaseClient, userId: string, conversationId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', userId)
    .single()

  if (!profile) return null

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, user_id, document_ids')
    .eq('id', conversationId)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!conversation) return null

  const canManage =
    conversation.user_id === userId || profile.role === 'owner' || profile.role === 'admin'

  return { tenantId: profile.tenant_id as string, conversation, canManage }
}

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

  const access = await loadConversationAccess(supabase, user.id, id)
  if (!access) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
  if (!access.canManage) {
    return NextResponse.json({ error: 'You can only delete your own conversations' }, { status: 403 })
  }

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)
    .eq('tenant_id', access.tenantId)

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

  const access = await loadConversationAccess(supabase, user.id, id)
  if (!access) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { title, pinned, addDocumentIds, removeDocumentIds } = await request.json()

  if ((title !== undefined || pinned !== undefined) && !access.canManage) {
    return NextResponse.json({ error: 'You can only rename or pin your own conversations' }, { status: 403 })
  }

  const updates: { title?: string; pinned?: boolean; document_ids?: string[] | null } = {}

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

  if (addDocumentIds !== undefined || removeDocumentIds !== undefined) {
    if (addDocumentIds !== undefined && (!Array.isArray(addDocumentIds) || addDocumentIds.some((d: unknown) => typeof d !== 'string'))) {
      return NextResponse.json({ error: 'addDocumentIds must be an array of strings' }, { status: 400 })
    }
    if (removeDocumentIds !== undefined && (!Array.isArray(removeDocumentIds) || removeDocumentIds.some((d: unknown) => typeof d !== 'string'))) {
      return NextResponse.json({ error: 'removeDocumentIds must be an array of strings' }, { status: 400 })
    }

    let current: string[] = access.conversation.document_ids ?? []

    if (addDocumentIds) {
      current = Array.from(new Set([...current, ...addDocumentIds]))
    }
    if (removeDocumentIds) {
      current = current.filter((docId) => !removeDocumentIds.includes(docId))
    }

    // empty array would search nothing, null means all documents
    updates.document_ids = current.length > 0 ? current : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
    .select('document_ids')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, documentIds: updated?.document_ids ?? null })
}
