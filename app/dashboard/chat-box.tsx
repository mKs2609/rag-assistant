'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AttachMenu from './attach-menu'

interface Source {
  filename: string
  snippet: string
  verified: boolean | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

interface Document {
  id: string
  filename: string
  status: string
}

export default function ChatBox({
  activeConversationId,
  onConversationChange,
  scopedDocumentIds,
  scopedDocumentNames,
  documents,
  onAttachDocument,
}: {
  activeConversationId: string | null
  onConversationChange: (id: string) => void
  scopedDocumentIds: string[] | null
  scopedDocumentNames: string[] | null
  documents: Document[]
  onAttachDocument: (id: string) => Promise<void>
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attaching, setAttaching] = useState(false)
  const supabase = createClient()
  const router = useRouter()
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
        body: JSON.stringify({
          message: userMessage,
          conversationId: activeConversationId,
          documentIds: activeConversationId ? undefined : scopedDocumentIds,
        }),
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

  async function handleUploadNew(file: File) {
    setAttaching(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/documents', { method: 'POST', body: formData })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Upload failed')
      setAttaching(false)
      return
    }

    const data = await res.json()
    if (data.documentId) {
      await onAttachDocument(data.documentId)
    }
    router.refresh()
    setAttaching(false)
  }

  async function handleAttachExisting(docId: string) {
    setAttaching(true)
    await onAttachDocument(docId)
    setAttaching(false)
  }

  return (
    <div className="flex flex-col h-full bg-carbon">
      {scopedDocumentNames && scopedDocumentNames.length > 0 && (
        <div className="px-4 sm:px-8 py-2 flex items-center gap-2 text-xs flex-wrap">
          <span className="font-medium text-pewter shrink-0">Focused on:</span>
          {scopedDocumentNames.map((name, i) => (
            <span
              key={i}
              className="rounded px-2 py-0.5 text-slate bg-inkwell truncate max-w-[180px]"
              title={name}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-10 space-y-6">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-4xl text-bone tracking-wide">Ask something</p>
            <p className="text-sm text-pewter">about your documents</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={(m.role === 'user' ? 'flex justify-end' : 'flex justify-start') + ' animate-message-in'}>
            <div className="max-w-[85%] sm:max-w-[70%]">
              <div
                className={
                  'px-4 py-3 text-[15px] leading-relaxed rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] ' +
                  (m.role === 'user'
                    ? 'bg-graphite-card text-bone'
                    : 'bg-inkwell text-bone')
                }
              >
                {m.content}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.sources.map((s, j) => (
                    <div key={j} className="rounded-lg px-3 py-2 text-xs bg-inkwell shadow-[rgba(0,0,0,0.12)_0px_12px_12px_0px]">
                      <div className="flex items-center gap-1.5 text-pewter">
                        <span className="font-mono text-[#c99a5b]">[{j + 1}]</span>
                        <span className="text-bone">{s.filename}</span>
                        {s.verified === true && (
                          <span className="text-slate" title="This citation matches its source">✓ verified</span>
                        )}
                        {s.verified === false && (
                          <span className="text-red-400" title="This citation's wording doesn't clearly match its source — worth double-checking">
                            ⚠ unverified
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-pewter">&quot;{s.snippet}...&quot;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-message-in">
            <div className="bg-inkwell rounded-lg px-4 py-3 flex gap-1 shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px]">
              <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 sm:px-8 text-red-400 text-sm">{error}</p>}
      {attaching && <p className="px-4 sm:px-8 text-pewter text-sm">Attaching document…</p>}

      <div className="p-4 sm:p-6 flex justify-center">
        <form onSubmit={handleSend} className="w-full max-w-2xl">
          <div className="flex gap-2 items-center bg-inkwell rounded-lg px-4 py-2 shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px]">
            <AttachMenu
              documents={documents}
              currentlyScopedIds={scopedDocumentIds ?? []}
              onUploadNew={handleUploadNew}
              onAttachExisting={handleAttachExisting}
              disabled={attaching}
            />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something about your documents..."
              className="flex-1 bg-transparent text-bone placeholder:text-slate text-sm py-1.5 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="border border-slate text-bone rounded px-4 py-1.5 text-sm disabled:opacity-40 hover:bg-bone/10 transition-colors shrink-0"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}