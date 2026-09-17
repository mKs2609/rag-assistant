import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// deletes a question and the answer right after it
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { data: message } = await supabase
    .from('messages')
    .select('id, conversation_id, role, user_id, created_at')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }
  if (message.role !== 'user') {
    return NextResponse.json({ error: 'Only questions can be deleted' }, { status: 400 })
  }

  const isAdmin = profile.role === 'owner' || profile.role === 'admin'
  let allowed = isAdmin || message.user_id === user.id

  // older messages have no sender, fall back to who started the conversation
  if (!allowed && message.user_id === null) {
    const { data: conversation } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', message.conversation_id)
      .eq('tenant_id', profile.tenant_id)
      .single()
    allowed = conversation?.user_id === user.id
  }

  if (!allowed) {
    return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 })
  }

  const { data: next } = await supabase
    .from('messages')
    .select('id, role')
    .eq('conversation_id', message.conversation_id)
    .gt('created_at', message.created_at)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const ids = [message.id]
  if (next?.role === 'assistant') ids.push(next.id)

  // permission is checked above, older answers have no sender so RLS can't match them
  const { error } = await createAdminClient()
    .from('messages')
    .delete()
    .in('id', ids)
    .eq('tenant_id', profile.tenant_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, deletedIds: ids })
}
