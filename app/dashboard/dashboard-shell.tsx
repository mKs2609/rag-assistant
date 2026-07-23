'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ConversationList from './conversation-list'
import ChatBox from './chat-box'
import DocumentUpload from './document-upload'
import DocumentList from './document-list'
import DocumentPicker from './document-picker'
import LogoutButton from './logout-button'

interface Document {
  id: string
  filename: string
  status: string
}

export default function DashboardShell({
  workspaceName,
  documents,
}: {
  workspaceName: string
  documents: Document[]
}) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDocumentIds, setPendingDocumentIds] = useState<string[]>([])
  const [scopedDocumentIds, setScopedDocumentIds] = useState<string[] | null>(null)
  const supabase = createClient()

  const scopedDocumentNames = scopedDocumentIds
    ? documents.filter((d) => scopedDocumentIds.includes(d.id)).map((d) => d.filename)
    : null

  async function handleSelectConversation(id: string | null) {
    setActiveConversationId(id)

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
  }

  return (
    <div className="flex h-screen bg-bg text-text font-body">
      <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="font-display text-lg">{workspaceName}</h1>
          <LogoutButton />
        </div>

        <div className="p-4">
          <button
            onClick={() => {
              setPendingDocumentIds([])
              setPickerOpen(true)
            }}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 hover:bg-surface-muted transition-colors"
          >
            + New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <ConversationList
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
          />
        </div>

        <div className="p-4 border-t border-border space-y-3">
          <DocumentUpload />
          <DocumentList documents={documents} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {pickerOpen && (
          <DocumentPicker
            documents={documents}
            selectedIds={pendingDocumentIds}
            onToggle={toggleDocument}
            onStart={handleStartChat}
            onCancel={() => setPickerOpen(false)}
          />
        )}
        <ChatBox
          activeConversationId={activeConversationId}
          onConversationChange={setActiveConversationId}
          scopedDocumentIds={scopedDocumentIds}
          scopedDocumentNames={scopedDocumentNames}
        />
      </main>
    </div>
  )
}