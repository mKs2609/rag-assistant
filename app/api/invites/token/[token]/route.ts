import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
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