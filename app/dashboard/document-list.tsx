'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Document {
  id: string
  filename: string
  status: string
}

const statusColor: Record<string, string> = {
  ready: 'bg-bone',
  processing: 'bg-fog',
  failed: 'bg-red-400',
}

const statusLabel: Record<string, string> = {
  ready: 'Ready',
  processing: 'Processing…',
  failed: 'Failed to process',
}

const POLL_INTERVAL_MS = 3000
// stop polling after ~3 minutes
const MAX_POLLS = 60

export default function DocumentList({ documents }: { documents: Document[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  // refresh while any document is still processing
  const hasProcessing = documents.some((d) => d.status === 'processing')
  const pollCount = useRef(0)

  useEffect(() => {
    if (!hasProcessing) {
      pollCount.current = 0
      return
    }

    const timer = setInterval(() => {
      pollCount.current += 1
      if (pollCount.current > MAX_POLLS) {
        clearInterval(timer)
        return
      }
      router.refresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [hasProcessing, router])

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
      <p className="text-xs font-bold text-bone uppercase tracking-wider">Documents</p>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {documents.length ? (
        <ul className="space-y-0.5 max-h-32 overflow-y-auto">
          {documents.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-2 px-1 py-1 text-xs">
              <span
                className={
                  `w-1.5 h-1.5 rounded-full shrink-0 ${statusColor[doc.status] ?? 'bg-fog'} ` +
                  (doc.status === 'processing' ? 'animate-pulse' : '')
                }
                title={statusLabel[doc.status] ?? doc.status}
              />
              <span className="flex-1 truncate text-fog" title={doc.filename}>
                {doc.filename}
              </span>
              {doc.status === 'processing' && (
                <span className="text-pewter shrink-0">processing…</span>
              )}
              {doc.status === 'failed' && (
                <span
                  className="text-red-400 shrink-0"
                  title="Text extraction or embedding failed for this file"
                >
                  failed
                </span>
              )}
              <button
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="text-red-400 hover:underline disabled:opacity-40 shrink-0"
              >
                {deletingId === doc.id ? '…' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fog">No documents yet.</p>
      )}
    </div>
  )
}
