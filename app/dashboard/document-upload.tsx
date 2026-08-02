'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DocumentUpload() {
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
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/documents', { method: 'POST', body: formData })

      if (!res.ok) {
        let message = 'Upload failed'
        try {
          const data = await res.json()
          message = data.error ?? message
        } catch {
          // Response wasn't valid JSON at all — likely the connection was
          // cut short (e.g. a hosting body-size limit), not something our
          // own code returned.
          message = 'Upload failed — the file may be too large for the server to accept.'
        }
        setError(message)
        return
      }

      setFile(null)
      router.refresh()
    } catch (err) {
      setError('Network error during upload. Please try again.')
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