import { describe, it, expect } from 'vitest'
import { mergeMatches } from '@/lib/retrieval'

const chunk = (id: string) => ({ id, content: id })

describe('mergeMatches', () => {
  it('puts the vector results first, because they answer most questions', () => {
    const merged = mergeMatches([chunk('a'), chunk('b')], [chunk('c')], 6)
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('counts a chunk found by both searches once, not twice', () => {
    const merged = mergeMatches([chunk('a'), chunk('b')], [chunk('b'), chunk('c')], 6)
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps a keyword only result, which is the whole reason both searches run', () => {
    const merged = mergeMatches([chunk('a')], [chunk('code-ABC123')], 6)
    expect(merged.map((m) => m.id)).toContain('code-ABC123')
  })

  it('stops at the number asked for, so the prompt cannot grow without bound', () => {
    const vector = ['a', 'b', 'c', 'd', 'e'].map(chunk)
    const keyword = ['f', 'g', 'h'].map(chunk)
    expect(mergeMatches(vector, keyword, 6)).toHaveLength(6)
  })

  it('drops duplicates before counting, so a repeated chunk does not use up a place', () => {
    const vector = ['a', 'b', 'c'].map(chunk)
    const keyword = ['a', 'b', 'd', 'e'].map(chunk)
    expect(mergeMatches(vector, keyword, 4).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('survives either search returning nothing', () => {
    expect(mergeMatches([chunk('a')], [], 6).map((m) => m.id)).toEqual(['a'])
    expect(mergeMatches([], [chunk('b')], 6).map((m) => m.id)).toEqual(['b'])
    expect(mergeMatches([], [], 6)).toEqual([])
  })

  it('returns nothing rather than everything when asked for none', () => {
    expect(mergeMatches([chunk('a')], [chunk('b')], 0)).toEqual([])
    expect(mergeMatches([chunk('a')], [chunk('b')], -1)).toEqual([])
  })
})
