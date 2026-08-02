import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/documents/process'

export async function POST(request: Request) {
  try {
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

    const UPLOAD_RATE_LIMIT_MAX = 10
    const UPLOAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

    const { count: recentUploads } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', user.id)
      .gte('created_at', new Date(Date.now() - UPLOAD_RATE_LIMIT_WINDOW_MS).toISOString())

    if ((recentUploads ?? 0) >= UPLOAD_RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: `Rate limit exceeded. You can upload up to ${UPLOAD_RATE_LIMIT_MAX} documents every 10 minutes.` },
        { status: 429 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` },
        { status: 400 }
      )
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

    await processDocument(document.id)

    return NextResponse.json({ success: true, documentId: document.id })
  } catch (err) {
    console.error('Upload route failed unexpectedly:', err)
    return NextResponse.json(
      { error: 'Upload failed unexpectedly. If the file is very large, try a smaller one.' },
      { status: 500 }
    )
  }
}