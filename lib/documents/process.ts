import { createAdminClient } from '@/lib/supabase/admin'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'
import { chunkText, batchChunks } from '@/lib/documents/chunking'
import { needsOcr, ocrPdf } from '@/lib/ocr'

const INSERT_BATCH_SIZE = 200

// a batch of up to 128 chunks, so slower than embedding one question, but it still has to
// end: processing runs against a deadline and a hung request would spend all of it
const EMBED_TIMEOUT_MS = 60_000

// a rate limit here lasts a minute, so four attempts over seven seconds could never
// outlast one. the waits below are sized to the window rather than to a transient blip.
const EMBED_ATTEMPTS = 6

/** how long to wait before attempt n. a 429 waits out the per minute window; anything
 *  else is treated as a transient fault and backs off quickly. */
export function embedRetryDelayMs(status: number, attempt: number): number {
  if (status === 429) return 22_000
  return Math.min(attempt * 2000, 8000)
}

/** how a file should be read, or null when it is a type we cannot read at all */
export function readAs(filename: string): 'pdf' | 'text' | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'txt' || ext === 'md') return 'text'
  return null
}

// a rate limit or a server fault is worth another attempt. a 400 means the request itself
// is wrong, and sending it again just spends another one.
export function shouldRetryEmbed(status: number, attempt: number): boolean {
  return (status === 429 || status >= 500) && attempt < EMBED_ATTEMPTS
}

// what the uploader is told when processing fails. the raw error is kept in the server log,
// because it names upstream services, quotas and in one case a billing page, and none of
// that belongs in a tenant's document list. this says what happened and what to do about it.
export function processingFailureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')

  if (/Unsupported file type/i.test(raw)) return raw
  if (/Ran out of time/i.test(raw)) {
    return 'This document was too long to finish processing in one go. Try splitting it into smaller files.'
  }
  if (/No extractable text/i.test(raw)) {
    return 'No text could be read from this file. If it is a scan, the page images could not be read either.'
  }
  if (/Voyage API error \(429\)/i.test(raw)) {
    return 'The embedding service was rate limited while processing this document. Please try again in a few minutes.'
  }
  if (/Voyage API error/i.test(raw)) {
    return 'The embedding service could not process this document. Please try again.'
  }
  if (/Download failed/i.test(raw) || /storage/i.test(raw)) {
    return 'The uploaded file could not be read back from storage. Please upload it again.'
  }
  return 'Something went wrong while processing this document. Please try uploading it again.'
}

async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const how = readAs(filename)

  if (how === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractPdfText(pdf, { mergePages: true })
    return text
  }

  if (how === 'text') {
    return buffer.toString('utf-8')
  }

  throw new Error(
    `Unsupported file type: .${filename.split('.').pop()?.toLowerCase()}. Supported: .pdf, .txt, .md`
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function embedBatch(texts: string[], attempt = 1): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: 'voyage-3.5',
      input_type: 'document',
    }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (shouldRetryEmbed(res.status, attempt)) {
      await sleep(embedRetryDelayMs(res.status, attempt))
      return embedBatch(texts, attempt + 1)
    }
    throw new Error(`Voyage API error (${res.status}): ${errText}`)
  }

  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

// what must be left after the last batch to write the chunks and set the status
const EMBED_TIME_RESERVE_MS = 30_000

/** enough time for another batch, including a rate limit wait, and the writing afterwards */
export function canEmbedAnotherBatch(now: number, deadline: number): boolean {
  return now + embedRetryDelayMs(429, 1) + EMBED_TIME_RESERVE_MS < deadline
}

async function getEmbeddings(texts: string[], deadline = Infinity): Promise<number[][]> {
  const batches = batchChunks(texts)
  const embeddings: number[][] = []

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await sleep(300)
    // waiting out a rate limit is slow by design, so a long document can run into the
    // platform's limit. stopping here marks it failed, which the user can see and retry.
    // running on until the function is killed left it on "processing" for ever.
    if (!canEmbedAnotherBatch(Date.now(), deadline)) {
      throw new Error(
        `Ran out of time after ${i} of ${batches.length} batches. The free embedding tier allows ` +
          `10,000 tokens a minute, so a document this long needs more time than one request has.`
      )
    }
    embeddings.push(...(await embedBatch(batches[i])))
  }

  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding count mismatch: expected ${texts.length}, got ${embeddings.length}`)
  }

  return embeddings
}

// download -> extract -> chunk -> embed -> store -> mark ready/failed
// deadline is when the platform will stop this function, so long work can stop cleanly first
export async function processDocument(documentId: string, deadline = Infinity) {
  const admin = createAdminClient()

  const { data: doc, error: docError } = await admin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    console.error('processDocument: document not found', documentId)
    return
  }

  try {
    const { data: fileData, error: downloadError } = await admin.storage
      .from('documents')
      .download(doc.storage_path)

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? 'Download failed')
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    let text = await extractText(buffer, doc.filename)

    // scanned PDFs have no text layer, read the pages as images instead
    if (doc.filename.toLowerCase().endsWith('.pdf') && needsOcr(text)) {
      try {
        const ocrText = await ocrPdf(buffer, deadline)
        if (ocrText.length > text.trim().length) {
          console.log(`OCR recovered ${ocrText.length} characters from ${doc.filename}`)
          text = ocrText
        }
      } catch (err) {
        console.error('OCR failed:', err)
      }
    }

    if (!text.trim()) {
      throw new Error('No extractable text found in file')
    }

    const chunks = chunkText(text)
    const embeddings = await getEmbeddings(chunks, deadline)

    const rows = chunks.map((content, i) => ({
      tenant_id: doc.tenant_id,
      document_id: doc.id,
      content,
      embedding: embeddings[i],
      chunk_index: i,
    }))

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const { error: insertError } = await admin
        .from('document_chunks')
        .insert(rows.slice(i, i + INSERT_BATCH_SIZE))
      if (insertError) throw new Error(insertError.message)
    }

    await admin.from('documents').update({ status: 'ready', error: null }).eq('id', documentId)
  } catch (err) {
    console.error('processDocument failed:', err)
    await admin
      .from('documents')
      .update({ status: 'failed', error: processingFailureReason(err) })
      .eq('id', documentId)
  }
}
