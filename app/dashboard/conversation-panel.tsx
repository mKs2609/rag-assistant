'use client'

import { useState } from 'react'
import ConversationList from './conversation-list'
import ChatBox from './chat-box'

export default function ConversationPanel() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  return (
    <>
      <ConversationList
        activeConversationId={activeConversationId}
        onSelect={setActiveConversationId}
      />
      <ChatBox
        activeConversationId={activeConversationId}
        onConversationChange={setActiveConversationId}
      />
    </>
  )
}