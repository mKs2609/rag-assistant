export const CHUNK_SIZE = 1000
export const CHUNK_OVERLAP = 150

// voyage accepts at most 128 inputs in one request. this is the API's own cap.
export const EMBED_BATCH_SIZE = 128

// the cap that actually binds is tokens per minute, not inputs per request. the free tier
// allows 10,000, and measured against it a 1000 character chunk costs about 227 tokens, so
// a minute buys roughly 44 chunks. the old budget of 400,000 characters was about 90,000
// tokens, nine times a whole minute in a single request, which no amount of waiting could
// let through: every document over about 44 chunks failed permanently and said only
// "failed". 25,000 characters is about 5,700 tokens, so two batches fit inside a minute.
export const EMBED_BATCH_CHAR_BUDGET = 25_000

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
