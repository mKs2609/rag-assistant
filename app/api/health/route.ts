import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supabase pauses a free project after seven days without activity, so something has to touch
// the database on a schedule. The first attempt at that loaded the sign in page, on the
// assumption that proxy.ts refreshing the session counted. It does not: supabase.auth.getUser()
// returns AuthSessionMissingError without making a request when there is no session cookie, so
// an anonymous visit to any page reaches Supabase zero times. The project was scheduled for
// pausing while that workflow had been passing every three days.
//
// This route makes a real query instead. Row Level Security returns nothing to an anonymous
// caller, which is the point: the request still reaches Postgres, and no row can come back.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()

  // head: true asks for no rows at all, only the count, which RLS makes 0 here. It is the
  // cheapest query that still has to be answered by the database.
  const { error } = await supabase.from('tenants').select('id', { head: true, count: 'exact' })

  // the message would name the database, so it is logged rather than returned
  if (error) {
    console.error('health check could not reach the database:', error.message)
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
