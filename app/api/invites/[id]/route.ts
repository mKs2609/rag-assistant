import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// This single [id] segment serves two different callers that happen to
// share the same URL shape: the public invite page passes the invite's
// random token here to check validity (GET), while the owner's "Revoke"
// button passes the invite's real database id to delete it (DELETE).
// Next.js requires one consistent segment name per directory level, so
// both live here instead of two separate folders — which is exactly what
// caused the 405 in the first place.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: token } = await params
  const admin = createAdminClient()

  const { data: invite } = await admin
    .from('tenant_invites')
    .select('id, tenant_id, role, used_at, expires_at, tenants(name)')
    .eq('token', token)
    .single()

  if (!invite) {
    return NextResponse.json({ error: 'This invite link is invalid.' }, { status: 404 })
  }
  if (invite.used_at) {
    return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 400 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite link has expired.' }, { status: 400 })
  }

  return NextResponse.json({
    workspaceName: (invite.tenants as any)?.name ?? 'a workspace',
    role: invite.role,
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can revoke invites' }, { status: 403 })
  }

  const { error } = await supabase.from('tenant_invites').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}