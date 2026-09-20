// splitting document text and grouping chunks into embedding requests

export const CHUNK_SIZE = 1000
export const CHUNK_OVERLAP = 150

// voyage limits inputs and tokens per request, so embed in batches
export const EMBED_BATCH_SIZE = 128
export const EMBED_BATCH_CHAR_BUDGET = 400_000

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end).trim())
    start += chunkSize - overlap
  }
  return chunks.filter((c) => c.length > 0)
}

export function batchChunks(chunks: string[]): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  let currentChars = 0

  for (const chunk of chunks) {
    const wouldExceed =
      current.length >= EMBED_BATCH_SIZE ||
      (current.length > 0 && currentChars + chunk.length > EMBED_BATCH_CHAR_BUDGET)

    if (wouldExceed) {
      batches.push(current)
      current = []
      currentChars = 0
    }

    current.push(chunk)
    currentChars += chunk.length
  }

  if (current.length > 0) batches.push(current)
  return batches
}
