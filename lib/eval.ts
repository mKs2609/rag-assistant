// scoring for an evaluation run, kept out of the route so it can be tested directly.
//
// retrieval and the answer are measured separately on purpose. searching needs the
// embedding and the database, writing the answer needs the model, and the model is the
// part that runs out of free quota. a run that could not reach the model still has a
// complete, honest retrieval result, and throwing it away was hiding the half of the
// system that works.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to',
  'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'and', 'or',
])

export function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  )
}

/** half the expected keywords is a pass, so one phrasing out of several still counts */
export function answerIsCorrect(answer: string, expectedKeywords: string[]): boolean {
  if (expectedKeywords.length === 0) return true
  const words = significantWords(answer)
  const found = expectedKeywords.filter((keyword) => words.has(keyword.toLowerCase()))
  return found.length / expectedKeywords.length >= 0.5
}

export function keywordsFoundIn(answer: string, expectedKeywords: string[]): string[] {
  const words = significantWords(answer)
  return expectedKeywords.filter((keyword) => words.has(keyword.toLowerCase()))
}

/** null means the question was never measured, which is not the same as getting it wrong */
export interface Outcome {
  retrievalHit: boolean | null
  answerCorrect: boolean | null
}

export interface RunScore {
  retrievalAccuracy: number | null
  retrievalScored: number
  answerAccuracy: number | null
  answerScored: number
  total: number
}

function share(values: (boolean | null)[]): { accuracy: number | null; scored: number } {
  const measured = values.filter((value): value is boolean => value !== null)
  if (measured.length === 0) return { accuracy: null, scored: 0 }
  return { accuracy: measured.filter(Boolean).length / measured.length, scored: measured.length }
}

export function scoreRun(results: Outcome[]): RunScore {
  const retrieval = share(results.map((r) => r.retrievalHit))
  const answer = share(results.map((r) => r.answerCorrect))
  return {
    retrievalAccuracy: retrieval.accuracy,
    retrievalScored: retrieval.scored,
    answerAccuracy: answer.accuracy,
    answerScored: answer.scored,
    total: results.length,
  }
}

// a run works through the questions in order and the time budget gives out before the
// end, so the last few were never reached. starting one step further along each time
// means every question gets its turn across a handful of runs, rather than two whole
// categories going permanently unmeasured.
export function rotate<T>(items: T[], by: number): T[] {
  if (items.length === 0) return []
  const offset = ((Math.trunc(by) % items.length) + items.length) % items.length
  return offset === 0 ? [...items] : [...items.slice(offset), ...items.slice(0, offset)]
}
