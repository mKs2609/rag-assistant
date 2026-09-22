import { PDFDocument } from 'pdf-lib'
import { callGemini } from '@/lib/gemini'

// a scanned page yields little or no extractable text, that's when OCR is worth trying
export const MIN_EXTRACTED_TEXT_LENGTH = 40

// long scans are split into small requests so progress can be checked between them
export const OCR_PAGES_PER_REQUEST = 10

// one at a time: on the free gemini tier parallel requests from one key get queued.
// measured on 23 pages: 34s sequential vs 252s with 3 in parallel
export const OCR_CONCURRENCY = 1

// stop starting new page groups when less than this is left before the deadline,
// so there's still time to mark the document failed instead of being killed mid-way
export const OCR_TIME_RESERVE_MS = 60_000

export function needsOcr(extractedText: string): boolean {
  return extractedText.trim().length < MIN_EXTRACTED_TEXT_LENGTH
}

// zero-based page index ranges, e.g. 23 pages in groups of 10 -> [0-9], [10-19], [20-22]
export function pageGroups(pageCount: number, size = OCR_PAGES_PER_REQUEST): number[][] {
  const groups: number[][] = []
  for (let start = 0; start < pageCount; start += size) {
    const end = Math.min(start + size, pageCount)
    groups.push(Array.from({ length: end - start }, (_, i) => start + i))
  }
  return groups
}

// runs at most `limit` tasks at a time and keeps results in input order
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const OCR_PROMPT =
  'Transcribe all text in this document, in reading order. ' +
  'Return only the transcribed text, with no commentary. ' +
  'If the document contains no readable text, return nothing.'

// gemini reads the pages as images, so this works on scans that hold no text layer
async function transcribe(pdfBytes: Uint8Array): Promise<string> {
  const res = await callGemini('generateContent', {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: Buffer.from(pdfBytes).toString('base64') } },
          { text: OCR_PROMPT },
        ],
      },
    ],
  })

  if (!res.ok) {
    throw new Error(`OCR failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

export async function ocrPdf(buffer: Buffer, deadline = Infinity): Promise<string> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const groups = pageGroups(source.getPageCount())

  if (groups.length <= 1) {
    return transcribe(buffer)
  }

  // if any group fails the whole document fails, rather than being saved with pages missing
  const texts = await mapWithConcurrency(groups, OCR_CONCURRENCY, async (pages) => {
    if (Date.now() > deadline - OCR_TIME_RESERVE_MS) {
      throw new Error(`OCR ran out of time after ${pages[0]} of ${source.getPageCount()} pages`)
    }
    const part = await PDFDocument.create()
    const copied = await part.copyPages(source, pages)
    copied.forEach((page) => part.addPage(page))
    return transcribe(await part.save())
  })

  return texts.filter((text) => text.length > 0).join('\n\n')
}
