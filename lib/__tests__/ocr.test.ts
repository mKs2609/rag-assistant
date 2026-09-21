import { describe, it, expect } from 'vitest'
import { needsOcr, MIN_EXTRACTED_TEXT_LENGTH } from '@/lib/ocr'

describe('needsOcr', () => {
  it('is true for a scan with no text layer at all', () => {
    expect(needsOcr('')).toBe(true)
  })

  it('is true when a PDF yields only whitespace or stray characters', () => {
    expect(needsOcr('   \n  \t ')).toBe(true)
    expect(needsOcr('1')).toBe(true)
  })

  it('is false for a normal document, so OCR is skipped', () => {
    const realText = 'Certificate of completion. Issued on 15 March 2026 to Mohit Kumar.'
    expect(realText.length).toBeGreaterThan(MIN_EXTRACTED_TEXT_LENGTH)
    expect(needsOcr(realText)).toBe(false)
  })

  it('ignores surrounding whitespace when measuring', () => {
    const short = ' '.repeat(200) + 'page 1' + ' '.repeat(200)
    expect(needsOcr(short)).toBe(true)
  })
})
