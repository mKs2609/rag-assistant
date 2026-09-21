import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// implicit flow puts the session in the link itself, so the email works on any device.
// the browser client's pkce flow only works in the browser that asked for the reset
export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: null }))

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin

  const auth = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' } }
  )

  const { error } = await auth.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin}/reset-password`,
  })

  if (error) {
    console.error('Password reset request failed:', error.message)
  }

  // same answer whether or not the email has an account
  return NextResponse.json({ success: true })
}
