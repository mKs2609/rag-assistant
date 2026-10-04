'use client'

import { useEffect, useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { shortTimestamp } from '@/lib/time'

// these sit under every message, so they stay quiet until pointed at, but never
// disappear into the background the way a hover only control does
const BUTTON =
  'p-1.5 rounded text-bone/60 hover:text-bone hover:bg-bone/10 transition-colors disabled:opacity-40'

export function ActionButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={BUTTON + (danger ? ' hover:text-red-400' : '')}
    >
      {children}
    </button>
  )
}

export function ActionRow({ align, children }: { align: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <div
      className={
        'mt-1 flex items-center gap-0.5 ' + (align === 'right' ? 'justify-end' : 'justify-start')
      }
    >
      {children}
    </div>
  )
}

export function Timestamp({ iso }: { iso?: string }) {
  const stamp = iso ? shortTimestamp(iso) : ''
  if (!stamp) return null
  return <span className="text-xs text-bone/45 px-1 select-none">{stamp}</span>
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  // clear the tick, but not after the button has gone from the page
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <ActionButton
      label={copied ? 'Copied' : label}
      onClick={() => {
        copyText(text).then((ok) => setCopied(ok))
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" strokeLinecap="round" />
        </svg>
      )}
    </ActionButton>
  )
}

export function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RetryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-3.2-6.9" strokeLinecap="round" />
      <polyline points="21 3 21 9 15 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SpeakerIcon({ speaking }: { speaking: boolean }) {
  if (speaking) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5 6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
    </svg>
  )
}
