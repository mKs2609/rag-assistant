import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can view invites' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('tenant_invites')
    .select('id, token, role, used_at, expires_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invites: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can create invites' }, { status: 403 })
  }

  const { role } = await request.json().catch(() => ({ role: 'member' }))
  const inviteRole = role === 'admin' ? 'admin' : 'member'

  const { data, error } = await supabase
    .from('tenant_invites')
    .insert({ tenant_id: profile.tenant_id, role: inviteRole, created_by: user.id })
    .select('id, token, role, expires_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invite: data })
}