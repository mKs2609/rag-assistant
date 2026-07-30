'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Conversation {
  id: string
  title: string | null
  created_at: string
  pinned: boolean
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    async function loadConversations() {
      const { data } = await supabase
        .from('conversations')
        .select('id, title, created_at, pinned')
        .order('pinned', { ascending: false })
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-conv-menu]')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleDelete(id: string) {
    setOpenMenuId(null)
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

  function startEditing(c: Conversation) {
    setOpenMenuId(null)
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

  async function togglePin(c: Conversation) {
    setOpenMenuId(null)

    const res = await fetch(`/api/conversations/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !c.pinned }),
    })

    if (res.ok) {
      setConversations((prev) => {
        const updated = prev.map((item) =>
          item.id === c.id ? { ...item, pinned: !c.pinned } : item
        )
        return [...updated].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
      })
    }
  }

  if (loading) return <p className="text-xs text-bone/50 px-1">Loading…</p>
  if (conversations.length === 0) return <p className="text-xs text-bone/50 px-1">No conversations yet.</p>

  const pinned = conversations.filter((c) => c.pinned)
  const unpinned = conversations.filter((c) => !c.pinned)

  function renderRow(c: Conversation) {
    return (
      <li
        key={c.id}
        data-conv-menu
        onClick={() => editingId !== c.id && onSelect(c.id)}
        className={
          'relative flex items-center gap-1 text-sm px-3 py-2 cursor-pointer transition-all duration-150 ' +
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
          <span className="flex-1 truncate flex items-center gap-1.5">
            {c.pinned && <span className="text-xs">📌</span>}
            {c.title || 'Untitled conversation'}
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            setOpenMenuId(openMenuId === c.id ? null : c.id)
          }}
          className="shrink-0 text-bone/50 hover:text-bone px-1"
          aria-label="Conversation options"
        >
          ⋯
        </button>

        {openMenuId === c.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-1 z-30 w-36 bg-inkwell border border-ash rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] py-1"
          >
            <button
              onClick={() => startEditing(c)}
              className="w-full text-left px-3 py-2 text-sm text-bone hover:bg-bone/10"
            >
              Rename
            </button>
            <button
              onClick={() => togglePin(c)}
              className="w-full text-left px-3 py-2 text-sm text-bone hover:bg-bone/10"
            >
              {c.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={() => handleDelete(c.id)}
              disabled={deletingId === c.id}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-bone/10 disabled:opacity-40"
            >
              {deletingId === c.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-3">
      {pinned.length > 0 && (
        <div>
          <p className="text-xs font-bold text-bone uppercase tracking-wider px-1 mb-1">Pinned</p>
          <ul className="space-y-0.5">{pinned.map(renderRow)}</ul>
        </div>
      )}
      <div>
        {pinned.length > 0 && (
          <p className="text-xs font-bold text-bone uppercase tracking-wider px-1 mb-1">Recent</p>
        )}
        <ul className="space-y-0.5">{unpinned.map(renderRow)}</ul>
      </div>
    </div>
  )
}