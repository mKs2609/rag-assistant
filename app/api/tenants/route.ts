import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const { email, password, tenantName } = await request.json()

  if (!email || !password || !tenantName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Create the user directly through the admin API instead of the normal
  // signUp() flow. This skips Supabase's built-in confirmation email
  // entirely — no rate limit to hit — and email_confirm: true means the
  // account is usable immediately.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    // Don't confirm or deny that a specific email already has an account —
    // that's a real information leak (user enumeration), not just a
    // cosmetic wording issue. Other errors (weak password, etc.) still
    // pass through normally.
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