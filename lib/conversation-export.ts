// building the exported file was done inside the chat component, where it could not be
// tested. the shape of the file is a thing worth getting right, so it lives here.

export interface ExportSource {
  filename: string
  snippet: string
  verified: boolean | null
}

export interface ExportMessage {
  role: 'user' | 'assistant'
  content: string
  userId?: string | null
  senderName?: string | null
  sources?: ExportSource[]
}

const RULE = '-'.repeat(40)

/** who the line belongs to. an older message has no sender, so it is left unattributed */
function speaker(message: ExportMessage, currentUserId: string): string {
  if (message.role === 'assistant') return 'Assistant:'
  if (message.userId === currentUserId) return 'You:'
  if (message.userId) return `${message.senderName ?? 'Someone'}:`
  return 'Question:'
}

function verdict(verified: boolean | null): string {
  if (verified === true) return '(verified)'
  if (verified === false) return '(unverified)'
  return ''
}

export function toPlainText(
  messages: ExportMessage[],
  currentUserId: string,
  exportedAt: Date = new Date()
): string {
  const lines: string[] = ['Conversation Export', exportedAt.toLocaleString(), '='.repeat(40), '']

  for (const message of messages) {
    lines.push(speaker(message, currentUserId), message.content)

    if (message.sources && message.sources.length > 0) {
      lines.push('', 'Sources:')
      message.sources.forEach((source, i) => {
        lines.push(`  [${i + 1}] ${source.filename} ${verdict(source.verified)}`.trimEnd())
        lines.push(`      "${source.snippet}..."`)
      })
    }

    lines.push('', RULE, '')
  }

  return lines.join('\n')
}

// the header above is written with toLocaleString, so the filename has to use the local
// date too. toISOString gives the UTC day, which is the previous one for anyone ahead of
// UTC in the early hours: an export at 1am in India was named for yesterday.
export function exportFilename(exportedAt: Date = new Date()): string {
  const year = exportedAt.getFullYear()
  const month = String(exportedAt.getMonth() + 1).padStart(2, '0')
  const day = String(exportedAt.getDate()).padStart(2, '0')
  return `conversation-${year}-${month}-${day}.txt`
}
