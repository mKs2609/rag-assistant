'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Source {
  filename: string
  snippet: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

export default function ChatBox({
  activeConversationId,
  onConversationChange,
}: {
  activeConversationId: string | null
  onConversationChange: (id: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadMessages() {
      if (!activeConversationId) {
        setMessages([])
        return
      }
      const { data } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true })

      // If a newer click happened while this fetch was in flight, this
      // result is stale — don't let it overwrite what should be showing.
      if (!cancelled) {
        setMessages((data as Message[]) ?? [])
      }
    }
    loadMessages()

    return () => {
      cancelled = true
    }
  }, [activeConversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, conversationId: activeConversationId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong')
        return
      }

      const data = await res.json()
      onConversationChange(data.conversationId)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer, sources: data.sources }])
    } catch (err) {
      setError('Network error — the request failed to complete. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {messages.length === 0 && !loading && (
          <div className="h-full flex items-center justify-center text-text-muted">
            <p className="font-display text-2xl">Ask something about your documents</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={(m.role === 'user' ? 'flex justify-end' : 'flex justify-start') + ' animate-message-in'}>
            <div className="max-w-[70%]">
              <div
                className={
                  'rounded-2xl px-4 py-3 text-[15px] leading-relaxed ' +
                  (m.role === 'user'
                    ? 'bg-signal text-surface rounded-br-sm'
                    : 'bg-surface-muted text-text rounded-bl-sm')
                }
              >
                {m.content}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.sources.map((s, j) => (
                    <div key={j} className="border-l-2 border-source pl-3 py-1 text-xs text-text-muted">
                      <span className="font-mono text-source">[{j + 1}]</span>{' '}
                      <span className="text-source">{s.filename}</span>
                      <p className="mt-0.5">&quot;{s.snippet}...&quot;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-message-in">
            <div className="bg-surface-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-8 text-red-700 text-sm">{error}</p>}

      <form onSubmit={handleSend} className="border-t border-border p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something about your documents..."
            className="flex-1 border border-border rounded-full px-4 py-2.5 text-sm bg-surface focus:outline-none focus:border-signal transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-text text-surface rounded-full px-5 py-2.5 text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}