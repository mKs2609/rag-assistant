import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/documents/process'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${profile.tenant_id}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file)

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: document, error: dbError } = await supabase
    .from('documents')
    .insert({
      tenant_id: profile.tenant_id,
      uploaded_by: user.id,
      filename: file.name,
      storage_path: storagePath,
      status: 'processing',
    })
    .select()
    .single()

  if (dbError) {
    await supabase.storage.from('documents').remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Awaited here so it's easy to debug while building — a real production
  // setup would hand this off to a background queue instead of making the
  // upload request wait for chunking and embedding to finish.
  await processDocument(document.id)

  return NextResponse.json({ success: true })
}