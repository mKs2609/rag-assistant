'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { uploadDocumentDirect } from '@/lib/documents/upload-client'
import { useSpeechRecognition } from '@/lib/hooks/useSpeechRecognition'
import { useSpeechSynthesis } from '@/lib/hooks/useSpeechSynthesis'
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

interface ScopedDocument {
  id: string
  filename: string
}

// Gemini's answers use plain markdown — mainly **bold** for emphasis and
// "* " for bullet points — but the chat only ever rendered raw text, so
// those asterisks showed up literally instead of as real formatting.
function renderFormattedText(text: string) {
  return text.split('\n').map((line, i) => {
    const bulletMatch = line.match(/^\s*\*\s+(.*)/)
    const content = bulletMatch ? bulletMatch[1] : line
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
      ) : (
        part
      )
    )
    return (
      <span key={i} className="block">
        {bulletMatch && '• '}
        {parts}
      </span>
    )
  })
}

// A separate, plainer version just for text-to-speech — hearing "asterisk
// asterisk" or "bracket one" spoken aloud would be worse than the
// original visual glitch this is fixing.
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*\*\s+/gm, '')
    .replace(/\[\d+\]/g, '')
}

export default function ChatBox({
  activeConversationId,
  onConversationChange,
  scopedDocumentIds,
  scopedDocuments,
  documents,
  tenantId,
  onAttachDocument,
  onRemoveDocument,
}: {
  activeConversationId: string | null
  onConversationChange: (id: string) => void
  scopedDocumentIds: string[] | null
  scopedDocuments: ScopedDocument[] | null
  documents: Document[]
  tenantId: string
  onAttachDocument: (id: string) => Promise<void>
  onRemoveDocument: (id: string) => Promise<void>
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const { isListening, transcript, isSupported: micSupported, startListening, stopListening } =
    useSpeechRecognition()
  const { speak, stop: stopSpeaking, speakingId, isSupported: speechSupported } = useSpeechSynthesis()

  function handleExport() {
    const lines: string[] = []
    lines.push('Conversation Export')
    lines.push(new Date().toLocaleString())
    lines.push('='.repeat(40))
    lines.push('')

    for (const m of messages) {
      lines.push(m.role === 'user' ? 'You:' : 'Assistant:')
      lines.push(m.content)

      if (m.sources && m.sources.length > 0) {
        lines.push('')
        lines.push('Sources:')
        m.sources.forEach((s, i) => {
          const status = s.verified === true ? '(verified)' : s.verified === false ? '(unverified)' : ''
          lines.push(`  [${i + 1}] ${s.filename} ${status}`)
          lines.push(`      "${s.snippet}..."`)
        })
      }
      lines.push('')
      lines.push('-'.repeat(40))
      lines.push('')
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    let cancelled = false

    async function loadMessages() {
      if (!activeConversationId) {
        setMessages([])
        setMessagesLoading(false)
        return
      }
      setMessagesLoading(true)
      const { data } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true })

      if (!cancelled) {
        setMessages((data as Message[]) ?? [])
        setMessagesLoading(false)
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

  useEffect(() => {
    if (isListening) {
      setInput(transcript)
    }
  }, [transcript, isListening])

  function toggleMic() {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    if (isListening) {
      stopListening()
    }

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

      if (!res.body) {
        setError('No response received from the server.')
        return
      }

      // Placeholder that grows in place as tokens arrive.
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          let event: any
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }

          if (event.type === 'token') {
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, content: last.content + event.text }
              return copy
            })
          } else if (event.type === 'done') {
            onConversationChange(event.conversationId)
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, sources: event.sources }
              return copy
            })
          } else if (event.type === 'error') {
            setMessages((prev) => prev.slice(0, -1))
            setError(event.error ?? 'Something went wrong')
          }
        }
      }
    } catch (err) {
      setError('Network error — the request failed to complete. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleUploadNew(file: File) {
    setAttaching(true)
    setError('')

    try {
      const { documentId } = await uploadDocumentDirect(file, tenantId)
      await onAttachDocument(documentId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setAttaching(false)
    }
  }

  async function handleAttachExisting(docId: string) {
    setAttaching(true)
    await onAttachDocument(docId)
    setAttaching(false)
  }

  return (
    <div className="flex flex-col h-full bg-carbon">
            {messages.length > 0 && (
        <div className="flex justify-end px-4 sm:px-8 pt-2">
          <button
            onClick={handleExport}
            className="text-xs text-bone/70 hover:text-bone flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
            </svg>
            Download
          </button>
        </div>
      )}

      {scopedDocuments && scopedDocuments.length > 0 && (
        <div className="px-4 sm:px-8 py-2 flex items-center gap-2 text-xs flex-wrap">
          <span className="font-medium text-pewter shrink-0">Focused on:</span>
          {scopedDocuments.map((doc) => (
            <span
              key={doc.id}
              className="rounded px-2 py-0.5 bg-inkwell border border-slate text-bone truncate max-w-[200px] flex items-center gap-1.5"
            >
              <span className="truncate">{doc.filename}</span>
              <button
                type="button"
                onClick={() => onRemoveDocument(doc.id)}
                className="text-pewter hover:text-red-400 shrink-0 leading-none"
                aria-label={`Remove ${doc.filename} from this chat`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-10 space-y-6">
        {messagesLoading && (
          <div className="h-full flex items-center justify-center">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-bone/40 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-bone/40 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-bone/40 animate-bounce" />
            </div>
          </div>
        )}

        {!messagesLoading && messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-4xl text-bone tracking-wide">Ask something</p>
            <p className="text-sm text-bone/70">about your documents</p>
          </div>
        )}

        {messages.map((m, i) => {
          const messageId = i.toString()
          const isSpeaking = speakingId === messageId
          const isEmptyAssistantPlaceholder = m.role === 'assistant' && m.content === ''

          return (
            <div key={i} className={(m.role === 'user' ? 'flex justify-end' : 'flex justify-start') + ' animate-message-in'}>
              <div className="max-w-[85%] sm:max-w-[70%]">
                <div
                  className={
                    'px-4 py-3 text-[15px] leading-relaxed rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] flex items-start gap-2 ' +
                    (m.role === 'user'
                      ? 'bg-graphite-card text-bone'
                      : 'bg-inkwell text-bone')
                  }
                >
                  {isEmptyAssistantPlaceholder ? (
                    <span className="flex gap-1 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce" />
                    </span>
                  ) : (
                    <span className="flex-1 whitespace-pre-wrap">{renderFormattedText(m.content)}</span>
                  )}
                  {m.role === 'assistant' && !isEmptyAssistantPlaceholder && speechSupported && (
                    <button
                      type="button"
                      onClick={() => (isSpeaking ? stopSpeaking() : speak(stripMarkdownForSpeech(m.content), messageId))}
                      className="text-pewter hover:text-bone shrink-0 mt-0.5"
                      aria-label={isSpeaking ? 'Stop reading aloud' : 'Read this message aloud'}
                    >
                      {isSpeaking ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5 6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                  )}
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
          )
        })}
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
              placeholder={isListening ? 'Listening…' : 'Ask something about your documents...'}
              className="flex-1 bg-transparent text-bone placeholder:text-slate text-sm py-1.5 focus:outline-none"
            />
            {micSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={
                  'w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors ' +
                  (isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-bone hover:bg-bone/10')
                }
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" strokeLinecap="round" />
                  <line x1="12" y1="17" x2="12" y2="21" strokeLinecap="round" />
                  <line x1="8" y1="21" x2="16" y2="21" strokeLinecap="round" />
                </svg>
              </button>
            )}
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