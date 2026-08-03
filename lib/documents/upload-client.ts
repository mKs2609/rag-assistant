import { createClient } from '@/lib/supabase/client'

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export interface UploadResult {
  documentId: string
}

// Uploads a file directly from the browser to Supabase Storage, bypassing
// our own API route entirely for the file bytes. This exists specifically
// because Vercel's serverless functions have a hard 4.5MB request-body
// limit that no application-level config can override — routing large
// files through our own route would always fail in production regardless
// of any size cap we set ourselves. Only a small JSON metadata payload
// goes through our route afterward, to create the database row and
// trigger the chunking/embedding pipeline.
export async function uploadDocumentDirect(
  file: File,
  tenantId: string
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`)
  }

  const supabase = createClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${tenantId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file)

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const res = await fetch('/api/documents/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath, filename: file.name }),
  })

  if (!res.ok) {
    let message = 'Upload failed'
    try {
      const data = await res.json()
      message = data.error ?? message
    } catch {
      message = 'Upload failed unexpectedly.'
    }
    // Clean up the orphaned file — it made it to storage, but the metadata
    // step that would have made it a real document failed.
    await supabase.storage.from('documents').remove([storagePath])
    throw new Error(message)
  }

  const data = await res.json()
  return { documentId: data.documentId }
}