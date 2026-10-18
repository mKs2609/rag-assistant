// the chat and the evaluation harness have to retrieve identically, or the harness is
// measuring something the product does not do. merging the two searches was written out in
// both routes, so the two could drift apart silently. it lives here once instead.

export interface Match {
  id: string
}

// vector search is weak at exact identifiers and keyword search is weak at paraphrase, so
// both run and the results are merged. vector results come first because they answer the
// larger share of questions; duplicates are dropped by chunk id, since a chunk found by
// both searches is one passage, not two.
export function mergeMatches<T extends Match>(vector: T[], keyword: T[], keep: number): T[] {
  const seen = new Set<string>()
  const combined: T[] = []
  for (const match of [...vector, ...keyword]) {
    if (seen.has(match.id)) continue
    seen.add(match.id)
    combined.push(match)
  }
  return combined.slice(0, Math.max(0, keep))
}
