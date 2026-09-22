import { describe, it, expect, vi, afterEach } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  needsOcr,
  pageGroups,
  mapWithConcurrency,
  ocrPdf,
  MIN_EXTRACTED_TEXT_LENGTH,
  OCR_PAGES_PER_REQUEST,
} from '@/lib/ocr'

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

describe('pageGroups', () => {
  it('keeps a short scan in one request', () => {
    expect(pageGroups(3)).toEqual([[0, 1, 2]])
  })

  it('splits a long scan into groups of the request size', () => {
    const groups = pageGroups(23, 10)
    expect(groups.map((g) => g.length)).toEqual([10, 10, 3])
    expect(groups[2]).toEqual([20, 21, 22])
  })

  it('covers every page exactly once, in order', () => {
    const pages = pageGroups(57).flat()
    expect(pages).toEqual(Array.from({ length: 57 }, (_, i) => i))
  })

  it('never puts more pages in a request than the limit', () => {
    for (const group of pageGroups(95)) {
      expect(group.length).toBeLessThanOrEqual(OCR_PAGES_PER_REQUEST)
    }
  })

  it('returns nothing for an empty document', () => {
    expect(pageGroups(0)).toEqual([])
  })
})

describe('mapWithConcurrency', () => {
  it('keeps results in input order even when tasks finish out of order', async () => {
    const delays = [30, 5, 20, 1, 10]
    const results = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return i
    })
    expect(results).toEqual([0, 1, 2, 3, 4])
  })

  it('never runs more tasks at once than the limit', async () => {
    let running = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 12 }), 4, async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
    })
    expect(peak).toBe(4)
  })

  it('fails if any task fails, so a document is never saved with pages missing', async () => {
    const run = mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('page group failed')
      return n
    })
    await expect(run).rejects.toThrow('page group failed')
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})

describe('ocrPdf deadline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stops before calling the model when the processing deadline is too close', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const doc = await PDFDocument.create()
    for (let i = 0; i < OCR_PAGES_PER_REQUEST + 5; i++) doc.addPage([200, 200])
    const pdf = Buffer.from(await doc.save())

    await expect(ocrPdf(pdf, Date.now())).rejects.toThrow('ran out of time')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
