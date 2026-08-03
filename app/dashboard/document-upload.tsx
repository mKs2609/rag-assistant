'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadDocumentDirect } from '@/lib/documents/upload-client'

export default function DocumentUpload({ tenantId }: { tenantId: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setError('')

    try {
      await uploadDocumentDirect(file, tenantId)
      setFile(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-2">
      <p className="text-xs font-bold text-bone uppercase tracking-wider">Upload</p>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-xs text-fog file:mr-2 file:py-1 file:px-2 file:border file:border-ash file:bg-obsidian file:text-bone file:text-xs"
      />
      <button
        type="submit"
        disabled={!file || uploading}
        className="w-full bg-bone text-obsidian px-3 py-1.5 text-xs disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {uploading ? 'Uploading…' : 'Upload document'}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </form>
  )
}