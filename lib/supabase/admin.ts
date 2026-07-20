import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client. Bypasses RLS entirely.
// Only ever import this in server-only code (Route Handlers, Server
// Actions) — never in a Client Component, and never expose this key
// to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}