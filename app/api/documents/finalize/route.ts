import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/documents/process'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

// processing runs in after() and needs time for large PDFs
export const maxDuration = 60

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

    const { storagePath, filename } = await request.json()

    if (!storagePath || typeof storagePath !== 'string' || !filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'storagePath and filename are required' }, { status: 400 })
    }

    // path comes from the client, make sure it's in the user's tenant folder
    if (!storagePath.startsWith(`${profile.tenant_id}/`)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 403 })
    }

    const UPLOAD_RATE_LIMIT_MAX = 10
    const UPLOAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

    const { count: recentUploads } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', user.id)
      .gte('created_at', new Date(Date.now() - UPLOAD_RATE_LIMIT_WINDOW_MS).toISOString())

    if ((recentUploads ?? 0) >= UPLOAD_RATE_LIMIT_MAX) {
      await supabase.storage.from('documents').remove([storagePath])
      return NextResponse.json(
        { error: `Rate limit exceeded. You can upload up to ${UPLOAD_RATE_LIMIT_MAX} documents every 10 minutes.` },
        { status: 429 }
      )
    }

    // check the real file size, the client-side check can be bypassed
    const folderPath = storagePath.split('/').slice(0, -1).join('/')
    const objectName = storagePath.split('/').pop()!
    const { data: listing } = await supabase.storage
      .from('documents')
      .list(folderPath, { search: objectName })

    const objectInfo = listing?.find((f) => f.name === objectName)

    if (!objectInfo) {
      return NextResponse.json({ error: 'Uploaded file could not be found' }, { status: 400 })
    }

    if ((objectInfo.metadata?.size ?? 0) > MAX_FILE_SIZE_BYTES) {
      await supabase.storage.from('documents').remove([storagePath])
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` },
        { status: 400 }
      )
    }

    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        tenant_id: profile.tenant_id,
        uploaded_by: user.id,
        filename,
        storage_path: storagePath,
        status: 'processing',
      })
      .select()
      .single()

    if (dbError) {
      await supabase.storage.from('documents').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // process in the background, the UI polls for the status
    after(() => processDocument(document.id))

    return NextResponse.json({ success: true, documentId: document.id })
  } catch (err) {
    console.error('Finalize route failed unexpectedly:', err)
    return NextResponse.json({ error: 'Something went wrong finalizing the upload.' }, { status: 500 })
  }
}