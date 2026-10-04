import { describe, it, expect } from 'vitest'
import { shortTimestamp } from '@/lib/time'

// built from local parts on both sides, so the test reads the same in any timezone
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString()

describe('shortTimestamp', () => {
  const now = new Date(2026, 9, 5, 18, 0)

  it('shows the time for a message sent today', () => {
    expect(shortTimestamp(at(2026, 10, 5, 14, 32), now)).toBe('2:32 pm')
  })

  it('pads the minutes, so half past nine is not read as 9:3', () => {
    expect(shortTimestamp(at(2026, 10, 5, 9, 3), now)).toBe('9:03 am')
  })

  it('calls midnight twelve rather than zero', () => {
    expect(shortTimestamp(at(2026, 10, 5, 0, 5), now)).toBe('12:05 am')
    expect(shortTimestamp(at(2026, 10, 5, 12, 5), now)).toBe('12:05 pm')
  })

  it('shows the date once the message is from another day', () => {
    expect(shortTimestamp(at(2026, 8, 21, 14, 32), now)).toBe('21 Aug')
  })

  it('adds the year for a message from an earlier year', () => {
    expect(shortTimestamp(at(2025, 12, 31, 23, 59), now)).toBe('31 Dec 2025')
  })

  it('treats the same date in a different year as another day', () => {
    expect(shortTimestamp(at(2025, 10, 5, 14, 32), now)).toBe('5 Oct 2025')
  })

  it('shows nothing rather than Invalid Date when the stamp is unusable', () => {
    expect(shortTimestamp('not a date', now)).toBe('')
  })
})
