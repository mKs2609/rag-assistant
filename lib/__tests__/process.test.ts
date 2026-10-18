import { describe, it, expect } from 'vitest'
import {
  canEmbedAnotherBatch,
  embedRetryDelayMs,
  processingFailureReason,
  readAs,
  shouldRetryEmbed,
} from '@/lib/documents/process'

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
    expect(shouldRetryEmbed(429, 5)).toBe(true)
    expect(shouldRetryEmbed(429, 6)).toBe(false)
    expect(shouldRetryEmbed(500, 9)).toBe(false)
  })
})

describe('embedRetryDelayMs', () => {
  // a rate limit lasts a minute. backing off two seconds and trying again just spends
  // another request against a limit that has not moved, which is how every large document
  // used to fail: four attempts inside seven seconds, then "failed" with no reason.
  it('waits out the window for a rate limit rather than backing off a little', () => {
    expect(embedRetryDelayMs(429, 1)).toBeGreaterThanOrEqual(20_000)
    expect(embedRetryDelayMs(429, 3)).toBeGreaterThanOrEqual(20_000)
  })

  it('backs off quickly for a server fault, which is usually gone in seconds', () => {
    expect(embedRetryDelayMs(500, 1)).toBeLessThan(5_000)
    expect(embedRetryDelayMs(503, 1)).toBeLessThan(5_000)
  })

  it('grows the wait for a repeated server fault, but keeps it bounded', () => {
    expect(embedRetryDelayMs(500, 2)).toBeGreaterThan(embedRetryDelayMs(500, 1))
    expect(embedRetryDelayMs(500, 50)).toBeLessThanOrEqual(8_000)
  })

  it('waits longer for a rate limit than for a server fault, which is the whole point', () => {
    expect(embedRetryDelayMs(429, 1)).toBeGreaterThan(embedRetryDelayMs(500, 1))
  })
})

describe('canEmbedAnotherBatch', () => {
  const now = 1_000_000

  it('starts another batch when there is room for it and the writing after', () => {
    expect(canEmbedAnotherBatch(now, now + 300_000)).toBe(true)
  })

  // without this the function was killed mid embedding and the document sat on
  // "processing" for ever, which is the failure OCR already guards against
  it('stops rather than starting one it cannot finish', () => {
    expect(canEmbedAnotherBatch(now, now + 5_000)).toBe(false)
    expect(canEmbedAnotherBatch(now, now)).toBe(false)
  })

  it('leaves room for a rate limit wait, not just for the request', () => {
    // 40s left is enough for a request but not for a 22s wait plus the writing after
    expect(canEmbedAnotherBatch(now, now + 40_000)).toBe(false)
  })

  it('never stops when there is no deadline, as when processing runs outside a function', () => {
    expect(canEmbedAnotherBatch(now, Infinity)).toBe(true)
  })
})

describe('processingFailureReason', () => {
  it('says what to do about a document too long to finish', () => {
    const reason = processingFailureReason(
      new Error('Ran out of time after 3 of 9 batches. The free embedding tier allows 10,000 tokens a minute')
    )
    expect(reason).toMatch(/splitting it into smaller files/i)
  })

  // the raw 429 body names the provider, the quota and a billing page. none of that
  // belongs in a tenant's document list, and the point of this function is to stop it
  // arriving there.
  it('does not pass an upstream error through to the uploader', () => {
    const raw =
      'Voyage API error (429): {"detail":"You have not yet added your payment method in the billing page ' +
      'and will have reduced rate limits of 3 RPM and 10K TPM. See https://dashboard.voyageai.com/"}'
    const reason = processingFailureReason(new Error(raw))
    expect(reason).toMatch(/rate limited/i)
    expect(reason).not.toMatch(/voyage/i)
    expect(reason).not.toMatch(/payment|billing|dashboard/i)
    expect(reason).not.toMatch(/TPM|RPM/)
  })

  it('tells a scan apart from a file it could not read at all', () => {
    expect(processingFailureReason(new Error('No extractable text found in file'))).toMatch(/scan/i)
  })

  it('keeps the unsupported type message, which already names the type and the alternatives', () => {
    const reason = processingFailureReason(
      new Error('Unsupported file type: .xlsx. Supported: .pdf, .txt, .md')
    )
    expect(reason).toContain('.xlsx')
    expect(reason).toContain('.pdf')
  })

  it('asks for a re-upload when the file could not be read back', () => {
    expect(processingFailureReason(new Error('Download failed'))).toMatch(/upload it again/i)
  })

  it('still says something useful for an error it has never seen', () => {
    expect(processingFailureReason(new Error('kaboom'))).toMatch(/try uploading it again/i)
    expect(processingFailureReason(null)).toMatch(/try uploading it again/i)
    expect(processingFailureReason(undefined)).toMatch(/try uploading it again/i)
  })

  it('never returns an empty string, which would render as a blank line', () => {
    for (const err of [new Error(''), '', null, 0]) {
      expect(processingFailureReason(err).length).toBeGreaterThan(10)
    }
  })
})
