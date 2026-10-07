'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { uploadDocumentDirect } from '@/lib/documents/upload-client'
import { useSpeechRecognition } from '@/lib/hooks/useSpeechRecognition'
import { useSpeechSynthesis } from '@/lib/hooks/useSpeechSynthesis'
import { toSpokenText, toCopyText } from '@/lib/markdown'
import AttachMenu from './attach-menu'
import RichText from './rich-text'
import {
  ActionButton,
  ActionRow,
  CopyButton,
  EditIcon,
  RetryIcon,
  SpeakerIcon,
  Timestamp,
  TrashIcon,
} from './message-actions'

interface Source {
  filename: string
  snippet: string
  verified: boolean | null
}

interface Message {
  id?: string
  userId?: string | null
  senderName?: string | null
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  sources?: Source[]
  status?: string
  timings?: { embed: number; search: number; model: number; total: number }
}

type StreamEvent =
  | { type: 'status'; status: string }
  | { type: 'token'; text: string }
  | {
      type: 'done'
      conversationId: string
      sources: Source[]
      userMessageId: string
      assistantMessageId: string | null
      timings?: { embed: number; search: number; model: number; total: number }
      content?: string
    }
  | { type: 'error'; error?: string }

interface Document {
  id: string
  filename: string
  status: string
}

interface ScopedDocument {
  id: string
  filename: string
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
  currentUserId,
  currentUserRole,
}: {
  activeConversationId: string | null
  onConversationChange: (id: string) => void
  scopedDocumentIds: string[] | null
  scopedDocuments: ScopedDocument[] | null
  documents: Document[]
  tenantId: string
  onAttachDocument: (id: string) => Promise<void>
  onRemoveDocument: (id: string) => Promise<void>
  currentUserId: string
  currentUserRole: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { isListening, isSupported: micSupported, startListening, stopListening } =
    useSpeechRecognition(setInput)
  const { speak, stop: stopSpeaking, speakingId, isSupported: speechSupported } = useSpeechSynthesis()

  function handleExport() {
    const lines: string[] = []
    lines.push('Conversation Export')
    lines.push(new Date().toLocaleString())
    lines.push('='.repeat(40))
    lines.push('')

    for (const m of messages) {
      const who =
        m.role === 'assistant'
          ? 'Assistant:'
          : m.userId === currentUserId
            ? 'You:'
            : m.userId
              ? `${m.senderName ?? 'Someone'}:`
              : 'Question:'
      lines.push(who)
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
        .select('id, user_id, role, content, sources, created_at, profiles(display_name, email)')
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true })

      if (!cancelled) {
        const restored: Message[] = (data ?? []).map((m) => {
          const sender = m.profiles as unknown as { display_name: string | null; email: string } | null
          return {
          id: m.id as string,
          userId: m.user_id as string | null,
          senderName: sender ? sender.display_name || sender.email : null,
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          createdAt: m.created_at as string,
          sources: (m.sources as Source[] | null) ?? undefined,
          }
        })
        setMessages(restored)
        setMessagesLoading(false)
      }
    }
    loadMessages()

    return () => {
      cancelled = true
    }
  }, [activeConversationId, supabase])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function toggleMic() {
    if (isListening) {
      stopListening()
    } else {
      setInput('')
      startListening()
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    if (isListening) {
      stopListening()
    }

    const question = input
    setInput('')
    ask(question)
  }

  // put a past question back in the box so it can be reworded before asking again
  function handleEdit(question: string) {
    setInput(question)
    inputRef.current?.focus()
  }

  async function ask(userMessage: string) {
    if (!userMessage.trim() || loading) return

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, userId: currentUserId, createdAt: new Date().toISOString() },
      { role: 'assistant', content: '', status: 'Sending…' },
    ])
    setLoading(true)
    setError('')
    setConfirmDeleteId(null)

    // nothing was saved (or the server removed it), take it out and give the text back
    function dropPendingExchange(message: string) {
      setMessages((prev) => prev.slice(0, -2))
      setInput((current) => current || userMessage)
      setError(message)
    }

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
        const data = await res.json().catch(() => ({}))
        dropPendingExchange(data.error ?? 'Something went wrong')
        return
      }

      if (!res.body) {
        setMessages((prev) => prev.slice(0, -1))
        setError('No response received from the server.')
        return
      }

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
          let event: StreamEvent
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }

          if (event.type === 'status') {
            const status = event.status
            setMessages((prev) => {
              const copy = [...prev]
              copy[copy.length - 1] = { ...copy[copy.length - 1], status }
              return copy
            })
          } else if (event.type === 'token') {
            const text = event.text
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, content: last.content + text }
              return copy
            })
          } else if (event.type === 'done') {
            const { sources, userMessageId, assistantMessageId, timings, content } = event
            onConversationChange(event.conversationId)
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = {
                ...last,
                // the server's copy carries the chart verdicts, the streamed text does not
                content: content ?? last.content,
                sources,
                status: undefined,
                timings,
                id: assistantMessageId ?? undefined,
                userId: currentUserId,
                createdAt: new Date().toISOString(),
              }
              copy[copy.length - 2] = { ...copy[copy.length - 2], id: userMessageId }
              return copy
            })
          } else if (event.type === 'error') {
            dropPendingExchange(event.error ?? 'Something went wrong')
          }
        }
      }
    } catch {
      setMessages((prev) => prev.slice(0, -1))
      setError('Network error, the request failed to complete. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin'

  // older messages have no sender, the server decides for those
  function canDelete(m: Message) {
    return m.role === 'user' && !!m.id && (isAdmin || !m.userId || m.userId === currentUserId)
  }

  async function handleDeleteMessage(id: string) {
    setDeletingId(id)
    setError('')
    stopSpeaking()

    const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setDeletingId(null)
    setConfirmDeleteId(null)

    if (!res.ok) {
      setError(data.error ?? 'Could not delete the message')
      return
    }

    const removed = new Set<string>(data.deletedIds ?? [id])
    setMessages((prev) => prev.filter((m) => !m.id || !removed.has(m.id)))
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

      <div className="flex-1 overflow-y-auto thin-scroll px-4 sm:px-8 py-10 space-y-6">
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
            <div
              key={i}
              data-testid={m.role === 'user' ? 'user-message' : 'assistant-message'}
              className={(m.role === 'user' ? 'flex justify-end' : 'flex justify-start') + ' animate-message-in'}
            >
              <div className="max-w-[85%] sm:max-w-[70%]">
                {m.role === 'user' && m.userId && (
                  <p className="mb-1 text-right text-xs text-pewter">
                    {m.userId === currentUserId ? 'You' : (m.senderName ?? 'Someone')}
                  </p>
                )}
                <div
                  className={
                    'px-4 py-3 text-[15px] leading-relaxed rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] flex items-start gap-2 ' +
                    (m.role === 'user'
                      ? 'bg-graphite-card text-bone'
                      : 'bg-inkwell text-bone')
                  }
                >
                  {isEmptyAssistantPlaceholder ? (
                    <span className="flex items-center gap-2.5 py-0.5" role="status">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-pewter animate-bounce" />
                      </span>
                      {m.status && <span className="text-sm text-pewter">{m.status}</span>}
                    </span>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <RichText text={m.content} />
                      {m.timings && (
                        <p
                          className="text-[11px] text-pewter mt-2"
                          title={`Embedding the question ${m.timings.embed}ms, searching ${m.timings.search}ms, model ${m.timings.model}ms`}
                        >
                          Answered in {(m.timings.total / 1000).toFixed(1)}s
                          <span className="text-fog">
                            {' '}· search {m.timings.embed + m.timings.search}ms · model{' '}
                            {(m.timings.model / 1000).toFixed(1)}s
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {confirmDeleteId === m.id ? (
                  <div className="mt-1 flex justify-end items-center gap-2 text-xs">
                    <span className="text-pewter">Delete this question and its answer?</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(m.id!)}
                      disabled={deletingId === m.id}
                      className="text-red-400 hover:underline disabled:opacity-40"
                    >
                      {deletingId === m.id ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-bone/70 hover:text-bone"
                    >
                      Cancel
                    </button>
                  </div>
                ) : m.role === 'user' ? (
                  <ActionRow align="right">
                    <Timestamp iso={m.createdAt} />
                    <ActionButton label="Ask this again" onClick={() => ask(m.content)} disabled={loading}>
                      <RetryIcon />
                    </ActionButton>
                    <ActionButton label="Edit and ask again" onClick={() => handleEdit(m.content)}>
                      <EditIcon />
                    </ActionButton>
                    <CopyButton text={m.content} label="Copy this question" />
                    {canDelete(m) && !loading && (
                      <ActionButton label="Delete this message" onClick={() => setConfirmDeleteId(m.id!)} danger>
                        <TrashIcon />
                      </ActionButton>
                    )}
                  </ActionRow>
                ) : (
                  // nothing to copy or read until the answer has finished arriving
                  !isEmptyAssistantPlaceholder &&
                  !(loading && i === messages.length - 1) && (
                    <ActionRow align="left">
                      <CopyButton text={toCopyText(m.content)} label="Copy this answer" />
                      {speechSupported && (
                        <ActionButton
                          label={isSpeaking ? 'Stop reading aloud' : 'Read this message aloud'}
                          onClick={() =>
                            isSpeaking ? stopSpeaking() : speak(toSpokenText(m.content), messageId)
                          }
                        >
                          <SpeakerIcon speaking={isSpeaking} />
                        </ActionButton>
                      )}
                      <Timestamp iso={m.createdAt} />
                    </ActionRow>
                  )
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.sources.map((s, j) => (
                      <div key={j} data-testid="source-card" className="rounded-lg px-3 py-2 text-xs bg-inkwell shadow-[rgba(0,0,0,0.12)_0px_12px_12px_0px]">
                        <div className="flex items-center gap-1.5 text-pewter">
                          <span className="font-mono text-accent">[{j + 1}]</span>
                          <span className="text-bone">{s.filename}</span>
                          {s.verified === true && (
                            <span className="text-slate" title="This citation matches its source">✓ verified</span>
                          )}
                          {s.verified === false && (
                            <span className="text-red-400" title="This citation's wording doesn't clearly match its source, worth double-checking">
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
              ref={inputRef}
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