import { createAdminClient } from '@/lib/supabase/admin'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end).trim())
    start += chunkSize - overlap
  }
  return chunks.filter((c) => c.length > 0)
}

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

async function getEmbeddings(texts: string[]): Promise<number[][]> {
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
    throw new Error(`Voyage API error (${res.status}): ${errText}`)
  }

  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

// Runs the whole pipeline for one document: download → extract text →
// chunk → embed each chunk → store → flip status to ready (or failed).
export async function processDocument(documentId: string) {
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
    const text = await extractText(buffer, doc.filename)

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

    const { error: insertError } = await admin.from('document_chunks').insert(rows)
    if (insertError) throw new Error(insertError.message)

    await admin.from('documents').update({ status: 'ready' }).eq('id', documentId)
  } catch (err) {
    console.error('processDocument failed:', err)
    await admin.from('documents').update({ status: 'failed' }).eq('id', documentId)
  }
}