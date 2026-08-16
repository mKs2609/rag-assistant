'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ConversationList from './conversation-list'
import ChatBox from './chat-box'
import DocumentUpload from './document-upload'
import DocumentList from './document-list'
import DocumentPicker from './document-picker'
import LogoutButton from './logout-button'
import EvalPanel from './eval-panel'
import TeamPanel from './team-panel'

interface Document {
  id: string
  filename: string
  status: string
}

export default function DashboardShell({
  workspaceName: initialWorkspaceName,
  documents,
  tenantId,
  currentUserRole,
  currentUserId,
}: {
  workspaceName: string
  documents: Document[]
  tenantId: string
  currentUserRole: string
  currentUserId: string
}) {
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDocumentIds, setPendingDocumentIds] = useState<string[]>([])
  const [scopedDocumentIds, setScopedDocumentIds] = useState<string[] | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [view, setView] = useState<'chat' | 'eval' | 'team'>('chat')
  const supabase = createClient()

  const scopedDocuments = scopedDocumentIds
    ? documents
        .filter((d) => scopedDocumentIds.includes(d.id))
        .map((d) => ({ id: d.id, filename: d.filename }))
    : null

  async function handleSelectConversation(id: string | null) {
    setActiveConversationId(id)
    setMobileSidebarOpen(false)
    setView('chat')

    if (!id) {
      setScopedDocumentIds(null)
      return
    }

    const { data } = await supabase
      .from('conversations')
      .select('document_ids')
      .eq('id', id)
      .single()

    setScopedDocumentIds(data?.document_ids ?? null)
  }

  function toggleDocument(id: string) {
    setPendingDocumentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  function handleStartChat() {
    setActiveConversationId(null)
    setScopedDocumentIds(pendingDocumentIds.length > 0 ? pendingDocumentIds : null)
    setPendingDocumentIds([])
    setPickerOpen(false)
    setMobileSidebarOpen(false)
  }

  async function handleAttachDocument(docId: string) {
    if (activeConversationId) {
      const res = await fetch(`/api/conversations/${activeConversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addDocumentIds: [docId] }),
      })
      if (res.ok) {
        const data = await res.json()
        setScopedDocumentIds(data.documentIds ?? null)
      }
    } else {
      setScopedDocumentIds((prev) => {
        const current = prev ?? []
        return current.includes(docId) ? current : [...current, docId]
      })
    }
  }

  async function handleRemoveDocument(docId: string) {
    if (activeConversationId) {
      const res = await fetch(`/api/conversations/${activeConversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeDocumentIds: [docId] }),
      })
      if (res.ok) {
        const data = await res.json()
        setScopedDocumentIds(data.documentIds ?? null)
      }
    } else {
      setScopedDocumentIds((prev) => {
        if (!prev) return prev
        const filtered = prev.filter((id) => id !== docId)
        return filtered.length > 0 ? filtered : null
      })
    }
  }

  return (
    <div className="flex h-dvh bg-obsidian text-bone font-body overflow-hidden">
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
        />
      )}

      <aside
        className={
          'w-72 shrink-0 border-r border-ash bg-obsidian flex flex-col z-30 ' +
          'fixed inset-y-0 left-0 transition-transform duration-200 ' +
          'md:static md:translate-x-0 ' +
          (mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="p-4 border-b border-ash flex items-center justify-between">
          <h1 className="font-display text-lg text-bone truncate">{workspaceName}</h1>
          <LogoutButton />
        </div>

        <div className="p-4 space-y-2">
          <button
            onClick={() => {
              setPendingDocumentIds([])
              setPickerOpen(true)
              setMobileSidebarOpen(false)
              setView('chat')
            }}
            className="w-full text-sm border border-ash text-bone px-3 py-2 hover:bg-bone/10 transition-colors"
          >
            + New chat
          </button>
          <button
            onClick={() => {
              setView(view === 'eval' ? 'chat' : 'eval')
              setMobileSidebarOpen(false)
            }}
            className={
              'w-full text-sm border px-3 py-2 transition-colors ' +
              (view === 'eval'
                ? 'border-[#c99a5b] text-[#c99a5b]'
                : 'border-ash text-bone hover:bg-bone/10')
            }
          >
            {view === 'eval' ? '← Back to chat' : 'Evaluate'}
          </button>
          <button
            onClick={() => {
              setView(view === 'team' ? 'chat' : 'team')
              setMobileSidebarOpen(false)
            }}
            className={
              'w-full text-sm border px-3 py-2 transition-colors ' +
              (view === 'team'
                ? 'border-[#c99a5b] text-[#c99a5b]'
                : 'border-ash text-bone hover:bg-bone/10')
            }
          >
            {view === 'team' ? '← Back to chat' : 'Team'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sidebar-scroll">
          <ConversationList
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
          />
        </div>

        <div className="p-4 border-t border-ash space-y-3">
          <DocumentUpload tenantId={tenantId} />
          <DocumentList documents={documents} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative bg-carbon min-w-0">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden absolute top-4 left-4 z-10 text-bone p-2 bg-obsidian/60 backdrop-blur-sm rounded-lg"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round" />
            <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" />
            <line x1="3" y1="18" x2="21" y2="18" strokeLinecap="round" />
          </svg>
        </button>
        <div className="h-14 shrink-0 md:hidden" />

        {pickerOpen && (
          <DocumentPicker
            documents={documents}
            selectedIds={pendingDocumentIds}
            onToggle={toggleDocument}
            onStart={handleStartChat}
            onCancel={() => setPickerOpen(false)}
          />
        )}

        <div className="relative z-0 flex-1 flex flex-col overflow-hidden">
          {view === 'eval' ? (
            <EvalPanel documents={documents} />
          ) : view === 'team' ? (
            <TeamPanel
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              workspaceName={workspaceName}
              onRenameWorkspace={setWorkspaceName}
            />
          ) : (
            <ChatBox
              activeConversationId={activeConversationId}
              onConversationChange={setActiveConversationId}
              scopedDocumentIds={scopedDocumentIds}
              scopedDocuments={scopedDocuments}
              documents={documents}
              tenantId={tenantId}
              onAttachDocument={handleAttachDocument}
              onRemoveDocument={handleRemoveDocument}
            />
          )}
        </div>
      </main>
    </div>
  )
}