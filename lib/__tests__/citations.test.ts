import { describe, it, expect } from 'vitest'
import { significantWords, isCitationGrounded } from '@/lib/citations'

describe('significantWords', () => {
  it('drops stopwords and words of two characters or fewer', () => {
    expect([...significantWords('the cat is on a mat')]).toEqual(['cat', 'mat'])
  })

  it('lowercases so matching is case insensitive', () => {
    expect(significantWords('Certificate').has('certificate')).toBe(true)
  })

  it('keeps exact codes, which is the point of hybrid search', () => {
    expect(significantWords('code 9977287 issued').has('9977287')).toBe(true)
  })

  it('splits on punctuation instead of gluing words together', () => {
    expect([...significantWords('issued: 15-MAR-2026.')]).toEqual(['issued', 'mar', '2026'])
  })

  it('drops numbers of two digits or fewer, so a day of the month never counts', () => {
    expect(significantWords('issued 15 March').has('15')).toBe(false)
    expect(significantWords('issued 2026 March').has('2026')).toBe(true)
  })

  it('de-duplicates repeated words', () => {
    expect([...significantWords('report report report')]).toEqual(['report'])
  })

  it('returns nothing for empty or stopword-only text', () => {
    expect(significantWords('').size).toBe(0)
    expect(significantWords('the and or of').size).toBe(0)
  })
})

describe('isCitationGrounded', () => {
  it('accepts a sentence whose words come from the source', () => {
    const claim = 'The certificate was issued on 15 March 2026.'
    const source = 'Certificate of completion. Issued on 15 March 2026 to Mohit Kumar.'
    expect(isCitationGrounded(claim, source)).toBe(true)
  })

  it('rejects a sentence that does not match its source', () => {
    const claim = 'The refund policy allows returns within thirty days.'
    const source = 'Certificate of completion. Issued on 15 March 2026 to Mohit Kumar.'
    expect(isCitationGrounded(claim, source)).toBe(false)
  })

  it('accepts a sentence with no significant words, nothing to contradict', () => {
    expect(isCitationGrounded('It is as it was.', 'Unrelated source text.')).toBe(true)
  })

  it('accepts exactly at the 30% threshold', () => {
    // ten significant words, three of which appear in the source
    const claim = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet'
    const source = 'alpha bravo charlie zulu yankee'
    expect(isCitationGrounded(claim, source)).toBe(true)
  })

  it('rejects just below the threshold', () => {
    // ten significant words, two of which appear in the source
    const claim = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet'
    const source = 'alpha bravo zulu yankee'
    expect(isCitationGrounded(claim, source)).toBe(false)
  })

  it('ignores case and punctuation when comparing', () => {
    expect(isCitationGrounded('INVOICE, total: 4200!', 'invoice total 4200')).toBe(true)
  })

  it('treats an empty source as ungrounded', () => {
    expect(isCitationGrounded('The certificate was issued in March.', '')).toBe(false)
  })
})
