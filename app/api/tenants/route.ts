import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const SIGNUP_RATE_LIMIT_MAX = 5
  const SIGNUP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

  const rateLimitAdmin = createAdminClient()
  const { count: recentSignups } = await rateLimitAdmin
    .from('signup_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', new Date(Date.now() - SIGNUP_RATE_LIMIT_WINDOW_MS).toISOString())

  if ((recentSignups ?? 0) >= SIGNUP_RATE_LIMIT_MAX) {
    return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 })
  }

  const { error: rateLimitLogError } = await rateLimitAdmin.from('signup_rate_limits').insert({ ip })
  if (rateLimitLogError) {
    console.error('Failed to record signup rate-limit entry:', rateLimitLogError.message)
  }

  const { email, password, tenantName, inviteToken, displayName } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (inviteToken) {
    const { data: invite } = await admin
      .from('tenant_invites')
      .select('id, tenant_id, role, used_at, expires_at')
      .eq('token', inviteToken)
      .single()

    if (!invite) {
      return NextResponse.json({ error: 'This invite link is invalid.' }, { status: 400 })
    }
    if (invite.used_at) {
      return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 400 })
    }
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite link has expired.' }, { status: 400 })
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      const isDuplicateEmail = authError?.message?.toLowerCase().includes('already been registered')
      const message = isDuplicateEmail
        ? 'Could not create an account with these details. If you already have an account, try logging in instead.'
        : authError?.message ?? 'Signup failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: authData.user.id,
      tenant_id: invite.tenant_id,
      email,
      role: invite.role,
      display_name: displayName || null,
    })

    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    await admin
      .from('tenant_invites')
      .update({ used_at: new Date().toISOString(), used_by: authData.user.id })
      .eq('id', invite.id)

    return NextResponse.json({ success: true, tenantId: invite.tenant_id })
  }

  if (!tenantName) {
    return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    const isDuplicateEmail = authError?.message?.toLowerCase().includes('already been registered')
    const message = isDuplicateEmail
      ? 'Could not create an account with these details. If you already have an account, try logging in instead.'
      : authError?.message ?? 'Signup failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({ name: tenantName, slug })
    .select()
    .single()

  if (tenantError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    email,
    role: 'owner',
  })

  if (profileError) {
    await admin.from('tenants').delete().eq('id', tenant.id)
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tenantId: tenant.id })
}