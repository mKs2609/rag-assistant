import { createAdminClient } from '@/lib/supabase/admin'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'
import { chunkText, batchChunks } from '@/lib/documents/chunking'
import { needsOcr, ocrPdf } from '@/lib/ocr'

const INSERT_BATCH_SIZE = 200

async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase()

  if (ext === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractPdfText(pdf, { mergePages: true })
    return text
  }

  if (ext === 'txt' || ext === 'md') {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported file type: .${ext}. Supported: .pdf, .txt, .md`)
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
  })

  if (!res.ok) {
    const errText = await res.text()
    // retry on rate limit / server errors
    const isRetryable = res.status === 429 || res.status >= 500
    if (isRetryable && attempt < 4) {
      await sleep(attempt * 2000)
      return embedBatch(texts, attempt + 1)
    }
    throw new Error(`Voyage API error (${res.status}): ${errText}`)
  }

  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const batches = batchChunks(texts)
  const embeddings: number[][] = []

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await sleep(300)
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
    const embeddings = await getEmbeddings(chunks)

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

    await admin.from('documents').update({ status: 'ready' }).eq('id', documentId)
  } catch (err) {
    console.error('processDocument failed:', err)
    await admin.from('documents').update({ status: 'failed' }).eq('id', documentId)
  }
}
