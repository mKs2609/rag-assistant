import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { displayName } = await request.json()
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return NextResponse.json({ error: 'A name is required' }, { status: 400 })
  }

  const cleanName = displayName.trim().slice(0, 60)

  // Every logged-in user updates only their own profile row — no owner
  // or admin permission needed, unlike renaming the whole workspace.
  const { error } = await supabase.from('profiles').update({ display_name: cleanName }).eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, displayName: cleanName })
}