'use client'

import { useState } from 'react'
import ConversationList from './conversation-list'
import ChatBox from './chat-box'
import DocumentUpload from './document-upload'
import DocumentList from './document-list'
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

  return (
    <div className="flex h-screen bg-bg text-text font-body">
      <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="font-display text-lg">{workspaceName}</h1>
          <LogoutButton />
        </div>

        <div className="p-4">
          <button
            onClick={() => setActiveConversationId(null)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 hover:bg-surface-muted transition-colors"
          >
            + New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <ConversationList
            activeConversationId={activeConversationId}
            onSelect={setActiveConversationId}
          />
        </div>

        <div className="p-4 border-t border-border space-y-3">
          <DocumentUpload />
          <DocumentList documents={documents} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatBox
          activeConversationId={activeConversationId}
          onConversationChange={setActiveConversationId}
        />
      </main>
    </div>
  )
}