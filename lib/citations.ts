// citation grounding: compare a cited sentence against the chunk it points at

export const CITATION_OVERLAP_THRESHOLD = 0.3

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to',
  'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'and', 'or',
  'but', 'if', 'this', 'that', 'it', 'its', 'has', 'have', 'had', 'not',
  'no', 'do', 'does', 'did', 'can', 'will', 'would', 'could', 'should',
  'their', 'they', 'he', 'she', 'you', 'your',
])

export function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  )
}

export function isCitationGrounded(claimSentence: string, sourceContent: string): boolean {
  const claimWords = significantWords(claimSentence)
  if (claimWords.size === 0) return true

  const sourceWords = significantWords(sourceContent)
  const overlap = [...claimWords].filter((w) => sourceWords.has(w)).length
  return overlap / claimWords.size >= CITATION_OVERLAP_THRESHOLD
}
