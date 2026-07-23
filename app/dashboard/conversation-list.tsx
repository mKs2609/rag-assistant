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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
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

  function startEditing(e: React.MouseEvent, c: Conversation) {
    e.stopPropagation()
    setEditingId(c.id)
    setEditValue(c.title || '')
  }

  async function handleRename(id: string) {
    const trimmed = editValue.trim()
    setEditingId(null)

    if (!trimmed) return

    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    })

    if (res.ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
      )
    }
  }

  if (loading) return <p className="text-xs text-text-muted px-1">Loading…</p>
  if (conversations.length === 0) return <p className="text-xs text-text-muted px-1">No conversations yet.</p>

  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li
          key={c.id}
          onClick={() => editingId !== c.id && onSelect(c.id)}
          className={
            'group flex items-center gap-1 text-sm px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ' +
            (c.id === activeConversationId
              ? 'bg-surface-muted text-text font-medium'
              : 'text-text-muted hover:bg-surface-muted')
          }
        >
          {editingId === c.id ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => handleRename(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(c.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="flex-1 bg-surface border border-signal rounded px-1 text-text outline-none"
            />
          ) : (
            <span className="flex-1 truncate">{c.title || 'Untitled conversation'}</span>
          )}

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={(e) => startEditing(e, c)}
              className="text-text-muted hover:text-signal text-xs"
            >
              Rename
            </button>
            <button
              onClick={(e) => handleDelete(e, c.id)}
              disabled={deletingId === c.id}
              className="text-red-700 hover:underline text-xs disabled:opacity-40"
            >
              {deletingId === c.id ? '…' : 'Delete'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}