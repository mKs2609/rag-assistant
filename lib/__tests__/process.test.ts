import { describe, it, expect } from 'vitest'
import { readAs, shouldRetryEmbed } from '@/lib/documents/process'

describe('readAs', () => {
  it('reads a PDF as a PDF', () => {
    expect(readAs('report.pdf')).toBe('pdf')
  })

  it('reads text and markdown as text', () => {
    expect(readAs('notes.txt')).toBe('text')
    expect(readAs('README.md')).toBe('text')
  })

  it('ignores the case of the extension, since uploads come from anywhere', () => {
    expect(readAs('SCAN.PDF')).toBe('pdf')
    expect(readAs('Notes.TXT')).toBe('text')
  })

  it('goes by the last extension, not an earlier one in the name', () => {
    expect(readAs('report.pdf.txt')).toBe('text')
    expect(readAs('v1.2.notes.md')).toBe('text')
  })

  it('refuses a type we cannot read rather than guessing', () => {
    expect(readAs('photo.png')).toBeNull()
    expect(readAs('sheet.xlsx')).toBeNull()
    expect(readAs('noextension')).toBeNull()
  })
})

describe('shouldRetryEmbed', () => {
  it('retries a rate limit, which passes on its own', () => {
    expect(shouldRetryEmbed(429, 1)).toBe(true)
  })

  it('retries a server fault, which is not our request being wrong', () => {
    expect(shouldRetryEmbed(500, 1)).toBe(true)
    expect(shouldRetryEmbed(503, 2)).toBe(true)
  })

  it('does not retry a bad request, which would fail the same way again', () => {
    expect(shouldRetryEmbed(400, 1)).toBe(false)
    expect(shouldRetryEmbed(401, 1)).toBe(false)
    expect(shouldRetryEmbed(404, 1)).toBe(false)
  })

  it('gives up rather than retrying for ever', () => {
    expect(shouldRetryEmbed(429, 3)).toBe(true)
    expect(shouldRetryEmbed(429, 4)).toBe(false)
    expect(shouldRetryEmbed(500, 9)).toBe(false)
  })
})
