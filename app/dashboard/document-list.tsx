'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Document {
  id: string
  filename: string
  status: string
}

const statusColor: Record<string, string> = {
  ready: 'bg-signal',
  processing: 'bg-source-dim',
  failed: 'bg-red-500',
}

export default function DocumentList({ documents }: { documents: Document[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError('')

    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to delete document')
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Documents</p>
      {error && <p className="text-red-700 text-xs">{error}</p>}
      {documents.length ? (
        <ul className="space-y-0.5 max-h-32 overflow-y-auto">
          {documents.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-2 px-1 py-1 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor[doc.status] ?? 'bg-text-muted'}`} />
              <span className="flex-1 truncate text-text-muted" title={doc.filename}>
                {doc.filename}
              </span>
              <button
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="opacity-0 group-hover:opacity-100 text-red-700 hover:underline disabled:opacity-40 shrink-0 transition-opacity"
              >
                {deletingId === doc.id ? '…' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-muted">No documents yet.</p>
      )}
    </div>
  )
}