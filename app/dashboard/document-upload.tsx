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

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/documents', { method: 'POST', body: formData })
    setUploading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Upload failed')
      return
    }

    setFile(null)
    router.refresh()
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