import { describe, it, expect } from 'vitest'
import { isUuid, isUuidList } from '@/lib/uuid'

describe('isUuid', () => {
  it('accepts a document id in either case', () => {
    expect(isUuid('7ce8f60f-3eb4-4946-bbc5-d13b18ee694e')).toBe(true)
    expect(isUuid('7CE8F60F-3EB4-4946-BBC5-D13B18EE694E')).toBe(true)
  })

  it('rejects anything Postgres would raise on', () => {
    expect(isUuid('not-an-id')).toBe(false)
    expect(isUuid('7ce8f60f3eb449461bbc5d13b18ee694e')).toBe(false)
    expect(isUuid('7ce8f60f-3eb4-4946-bbc5-d13b18ee694')).toBe(false)
    expect(isUuid('')).toBe(false)
  })

  it('rejects a value that is not a string at all', () => {
    expect(isUuid(null)).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid(['7ce8f60f-3eb4-4946-bbc5-d13b18ee694e'])).toBe(false)
  })

  it('does not accept a longer string that merely starts with an id', () => {
    expect(isUuid('7ce8f60f-3eb4-4946-bbc5-d13b18ee694e extra')).toBe(false)
  })
})

describe('isUuidList', () => {
  const one = '7ce8f60f-3eb4-4946-bbc5-d13b18ee694e'
  const two = 'a9e154fd-20ab-4676-b3b4-1fa0f4f2b06b'

  it('accepts a list of ids', () => {
    expect(isUuidList([one])).toBe(true)
    expect(isUuidList([one, two])).toBe(true)
  })

  it('rejects the list if a single entry is bad, since one is enough to raise', () => {
    expect(isUuidList([one, 'nonsense'])).toBe(false)
  })

  it('rejects an empty list, which would scope a search to nothing', () => {
    expect(isUuidList([])).toBe(false)
  })

  it('rejects something that is not a list', () => {
    expect(isUuidList(one)).toBe(false)
    expect(isUuidList(null)).toBe(false)
    expect(isUuidList({ 0: one })).toBe(false)
  })
})
