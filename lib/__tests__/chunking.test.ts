import { describe, it, expect } from 'vitest'
import {
  chunkText,
  batchChunks,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  EMBED_BATCH_SIZE,
  EMBED_BATCH_CHAR_BUDGET,
} from '@/lib/documents/chunking'

const letters = 'abcdefghijklmnopqrstuvwxyz'
const text = (length: number) =>
  Array.from({ length }, (_, i) => letters[i % letters.length]).join('')

describe('chunkText', () => {
  it('returns one chunk when the text is shorter than the chunk size', () => {
    expect(chunkText('a short document')).toEqual(['a short document'])
  })

  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('    ')).toEqual([])
  })

  it('never produces a chunk longer than the chunk size', () => {
    for (const chunk of chunkText(text(10_000))) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('overlaps consecutive chunks by the overlap size', () => {
    const chunks = chunkText(text(5_000))
    const tail = chunks[0].slice(-CHUNK_OVERLAP)
    expect(chunks[1].startsWith(tail)).toBe(true)
  })

  it('keeps every character of the source, so nothing is lost at a boundary', () => {
    const source = text(5_000)
    const chunks = chunkText(source)
    const step = CHUNK_SIZE - CHUNK_OVERLAP
    const rebuilt = chunks.map((c, i) => (i === 0 ? c : c.slice(CHUNK_OVERLAP))).join('')
    expect(rebuilt).toBe(source)
    expect(chunks.length).toBe(Math.ceil((source.length - CHUNK_OVERLAP) / step))
  })

  it('accepts custom sizes', () => {
    expect(chunkText('abcdefghij', 4, 1)).toEqual(['abcd', 'defg', 'ghij', 'j'])
  })
})

describe('batchChunks', () => {
  it('returns nothing for an empty list', () => {
    expect(batchChunks([])).toEqual([])
  })

  it('keeps a small document in a single request', () => {
    const chunks = ['one', 'two', 'three']
    expect(batchChunks(chunks)).toEqual([chunks])
  })

  it('never exceeds the input limit per request', () => {
    const chunks = Array.from({ length: 1_000 }, (_, i) => `chunk ${i}`)
    for (const batch of batchChunks(chunks)) {
      expect(batch.length).toBeLessThanOrEqual(EMBED_BATCH_SIZE)
    }
  })

  it('splits a document that is too large for one request', () => {
    // 1200 chunks is over the per-request input limit, the bug this guards against
    const chunks = Array.from({ length: 1_200 }, (_, i) => `chunk ${i}`)
    const batches = batchChunks(chunks)
    expect(batches.length).toBe(Math.ceil(1_200 / EMBED_BATCH_SIZE))
  })

  it('keeps every chunk, in order', () => {
    const chunks = Array.from({ length: 500 }, (_, i) => `chunk ${i}`)
    expect(batchChunks(chunks).flat()).toEqual(chunks)
  })

  it('splits on the character budget even when there are few chunks', () => {
    const big = text(CHUNK_SIZE)
    const chunkCount = Math.ceil(EMBED_BATCH_CHAR_BUDGET / CHUNK_SIZE) + 10
    const batches = batchChunks(Array.from({ length: chunkCount }, () => big))

    expect(batches.length).toBeGreaterThan(1)
    for (const batch of batches) {
      const chars = batch.reduce((total, c) => total + c.length, 0)
      expect(chars).toBeLessThanOrEqual(EMBED_BATCH_CHAR_BUDGET)
    }
  })

  it('keeps a single oversized chunk rather than dropping it', () => {
    const huge = text(EMBED_BATCH_CHAR_BUDGET + 1_000)
    expect(batchChunks([huge])).toEqual([[huge]])
  })
})
