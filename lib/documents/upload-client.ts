import { createClient } from '@/lib/supabase/client'

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export interface UploadResult {
  documentId: string
}

// upload straight to supabase storage, vercel functions have a 4.5MB body limit
// then /api/documents/finalize creates the row and starts processing
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
    // remove the uploaded file if finalize failed
    await supabase.storage.from('documents').remove([storagePath])
    throw new Error(message)
  }

  const data = await res.json()
  return { documentId: data.documentId }
}