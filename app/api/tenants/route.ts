import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type Registration =
  | { kind: 'created'; userId: string; needsConfirmation: boolean }
  | { kind: 'existing' }
  | { kind: 'error'; message: string }

// signUp sends the confirmation email when "Confirm email" is on in Supabase
async function registerUser(email: string, password: string, origin: string): Promise<Registration> {
  const auth = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await auth.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/login?confirmed=1` },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) return { kind: 'existing' }
    return { kind: 'error', message: error.message }
  }
  if (!data.user) return { kind: 'error', message: 'Signup failed' }

  // supabase returns a fake user with no identities when the email is already taken
  if (data.user.identities?.length === 0) return { kind: 'existing' }

  // an unconfirmed account signing up again gets its real user back and a new email,
  // it already has a profile so don't create (or on failure delete) anything
  const { data: existingProfile } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('id', data.user.id)
    .maybeSingle()
  if (existingProfile) return { kind: 'existing' }

  return { kind: 'created', userId: data.user.id, needsConfirmation: !data.session }
}

// same answer whether or not the email was already registered
const CHECK_EMAIL_RESPONSE = { success: true, needsConfirmation: true }

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
  const origin = request.headers.get('origin') ?? new URL(request.url).origin

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

    // claim the invite first, so two signups with the same link can't both succeed
    const { data: claimed } = await admin
      .from('tenant_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('used_at', null)
      .select('id')

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 400 })
    }

    const releaseInvite = () =>
      admin.from('tenant_invites').update({ used_at: null }).eq('id', invite.id)

    const registration = await registerUser(email, password, origin)

    if (registration.kind === 'existing') {
      await releaseInvite()
      return NextResponse.json(CHECK_EMAIL_RESPONSE)
    }
    if (registration.kind === 'error') {
      await releaseInvite()
      return NextResponse.json({ error: registration.message }, { status: 400 })
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: registration.userId,
      tenant_id: invite.tenant_id,
      email,
      role: invite.role,
      display_name: displayName || null,
    })

    if (profileError) {
      await admin.auth.admin.deleteUser(registration.userId)
      await releaseInvite()
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    await admin
      .from('tenant_invites')
      .update({ used_by: registration.userId })
      .eq('id', invite.id)

    return NextResponse.json({
      success: true,
      tenantId: invite.tenant_id,
      needsConfirmation: registration.needsConfirmation,
    })
  }

  if (!tenantName) {
    return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
  }

  const registration = await registerUser(email, password, origin)

  if (registration.kind === 'existing') {
    return NextResponse.json(CHECK_EMAIL_RESPONSE)
  }
  if (registration.kind === 'error') {
    return NextResponse.json({ error: registration.message }, { status: 400 })
  }
  const userId = registration.userId

  const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({ name: tenantName, slug })
    .select()
    .single()

  if (tenantError) {
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: userId,
    tenant_id: tenant.id,
    email,
    role: 'owner',
    display_name: displayName || null,
  })

  if (profileError) {
    await admin.from('tenants').delete().eq('id', tenant.id)
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    tenantId: tenant.id,
    needsConfirmation: registration.needsConfirmation,
  })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (profile.role !== 'owner') {
    return NextResponse.json({ error: 'Only the workspace owner can rename the workspace' }, { status: 403 })
  }

  const { name } = await request.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'A workspace name is required' }, { status: 400 })
  }

  const cleanName = name.trim().slice(0, 60)

  const { error } = await supabase.from('tenants').update({ name: cleanName }).eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, name: cleanName })
}