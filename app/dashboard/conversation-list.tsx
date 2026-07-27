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

  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-bone uppercase tracking-wider">Conversations</p>

      {loading && <p className="text-xs text-bone/50 px-1">Loading…</p>}
      {!loading && conversations.length === 0 && (
        <p className="text-xs text-bone/50 px-1">No conversations yet.</p>
      )}

      {!loading && conversations.length > 0 && (
        <ul className="space-y-0.5">
          {conversations.map((c) => (
            <li
              key={c.id}
              onClick={() => editingId !== c.id && onSelect(c.id)}
              className={
                'group flex items-center gap-1 text-sm px-3 py-2 cursor-pointer transition-all duration-150 ' +
                (c.id === activeConversationId
                  ? 'bg-bone/10 text-bone font-medium'
                  : 'text-bone/50 hover:bg-bone/10 hover:text-bone')
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
                  className="flex-1 bg-obsidian border border-ash px-1 text-bone outline-none"
                />
              ) : (
                <span className="flex-1 truncate">{c.title || 'Untitled conversation'}</span>
              )}

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={(e) => startEditing(e, c)} className="text-bone/50 hover:text-bone text-xs">
                  Rename
                </button>
                <button
                  onClick={(e) => handleDelete(e, c.id)}
                  disabled={deletingId === c.id}
                  className="text-red-400 hover:underline text-xs disabled:opacity-40"
                >
                  {deletingId === c.id ? '…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}