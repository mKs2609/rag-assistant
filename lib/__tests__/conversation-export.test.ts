import { describe, it, expect } from 'vitest'
import { toPlainText, exportFilename, type ExportMessage } from '@/lib/conversation-export'

const ME = 'me-123'
const AT = new Date(2026, 9, 14, 9, 30)

const asked = (extra: Partial<ExportMessage> = {}): ExportMessage => ({
  role: 'user',
  content: 'How many people are in each team?',
  userId: ME,
  ...extra,
})

describe('toPlainText', () => {
  it('attributes my own question to me', () => {
    expect(toPlainText([asked()], ME, AT)).toContain('You:\nHow many people are in each team?')
  })

  it('names a teammate who asked, since conversations are shared', () => {
    const theirs = asked({ userId: 'someone-else', senderName: 'Priya' })
    expect(toPlainText([theirs], ME, AT)).toContain('Priya:')
  })

  it('falls back to Someone when a teammate has no display name', () => {
    expect(toPlainText([asked({ userId: 'other', senderName: null })], ME, AT)).toContain('Someone:')
  })

  it('leaves an older message unattributed rather than claiming I asked it', () => {
    const output = toPlainText([asked({ userId: null })], ME, AT)
    expect(output).toContain('Question:')
    expect(output).not.toContain('You:')
  })

  it('labels an answer as the assistant', () => {
    const answer: ExportMessage = { role: 'assistant', content: 'Engineering has 42.' }
    expect(toPlainText([answer], ME, AT)).toContain('Assistant:')
  })

  it('writes each source with the verdict it was given', () => {
    const answer: ExportMessage = {
      role: 'assistant',
      content: 'Engineering has 42 [1].',
      sources: [
        { filename: 'team.txt', snippet: 'Engineering has 42', verified: true },
        { filename: 'notes.txt', snippet: 'something else', verified: false },
        { filename: 'other.txt', snippet: 'not checked', verified: null },
      ],
    }
    const output = toPlainText([answer], ME, AT)
    expect(output).toContain('[1] team.txt (verified)')
    expect(output).toContain('[2] notes.txt (unverified)')
    // a source with no verdict says nothing rather than claiming one
    expect(output).toContain('[3] other.txt')
    expect(output).not.toContain('other.txt (')
  })

  it('leaves out the sources section when an answer cites nothing', () => {
    const answer: ExportMessage = { role: 'assistant', content: 'I could not find that.' }
    expect(toPlainText([answer], ME, AT)).not.toContain('Sources:')
  })

  it('separates each exchange, so a long export stays readable', () => {
    const output = toPlainText([asked(), { role: 'assistant', content: '42.' }], ME, AT)
    expect(output.match(/-{40}/g)).toHaveLength(2)
  })

  it('still produces a header when there is nothing to export', () => {
    expect(toPlainText([], ME, AT)).toContain('Conversation Export')
  })
})

describe('exportFilename', () => {
  it('names the file for the day it was exported', () => {
    expect(exportFilename(new Date(Date.UTC(2026, 9, 14)))).toBe('conversation-2026-10-14.txt')
  })
})
