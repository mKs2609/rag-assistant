'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Conversation {
  id: string
  title: string | null
  created_at: string
}

export default function ConversationList({
  activeConversationId,
  onSelect,
}: {
  activeConversationId: string | null
  onSelect: (id: string | null) => void
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    async function loadConversations() {
      const { data } = await supabase
        .from('conversations')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!cancelled) {
        setConversations(data ?? [])
        setLoading(false)
      }
    }
    loadConversations()

    return () => {
      cancelled = true
    }
  }, [activeConversationId])

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setDeletingId(id)

    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === activeConversationId) {
        onSelect(null)
      }
    }
  }

  if (loading) return <p className="text-xs text-text-muted px-1">Loading…</p>
  if (conversations.length === 0) return <p className="text-xs text-text-muted px-1">No conversations yet.</p>

  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={
            'group flex items-center gap-1 text-sm px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ' +
            (c.id === activeConversationId
              ? 'bg-surface-muted text-text font-medium'
              : 'text-text-muted hover:bg-surface-muted')
          }
        >
          <span className="flex-1 truncate">{c.title || 'Untitled conversation'}</span>
          <button
            onClick={(e) => handleDelete(e, c.id)}
            disabled={deletingId === c.id}
            className="opacity-0 group-hover:opacity-100 text-red-700 hover:underline text-xs shrink-0 disabled:opacity-40 transition-opacity"
          >
            {deletingId === c.id ? '…' : 'Delete'}
          </button>
        </li>
      ))}
    </ul>
  )
}