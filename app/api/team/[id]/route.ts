import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (profile.role !== 'owner') {
    return NextResponse.json({ error: 'Only the workspace owner can remove members' }, { status: 403 })
  }
  if (id === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('id', id)
    .single()

  if (!target || target.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Member not found in this workspace' }, { status: 404 })
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the workspace owner' }, { status: 400 })
  }

  // Deleting the auth user is the real removal — this schema ties every
  // account to exactly one workspace, so there's no valid "member with no
  // workspace" state to leave someone in otherwise. Your profiles table
  // already cascade-deletes when the auth user is removed.
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}