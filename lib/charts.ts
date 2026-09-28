// a chart is far more convincing than a sentence, so an invented one does more damage.
// every point is checked against the passage it claims to come from before it is drawn,
// the same idea as citation grounding in lib/citations.ts but applied to numbers.

import { significantWords } from '@/lib/citations'
import { parseChart, type Chart, type ChartPoint } from '@/lib/markdown'

/** how much of a point's label must appear in the passage, when the label has words worth matching */
export const CHART_LABEL_OVERLAP_THRESHOLD = 0.5

/**
 * True when the number is written somewhere in the text. Handles the ways the same
 * figure gets written: 1240, 1,240, 1240.00, and a trailing per cent sign.
 */
export function numberAppearsIn(value: number, text: string): boolean {
  const withoutSeparators = text.replace(/(\d),(?=\d{3}\b)/g, '$1')
  const numbers = withoutSeparators.match(/-?\d+(?:\.\d+)?/g)
  if (!numbers) return false
  return numbers.some((found) => {
    const parsed = Number(found)
    if (!Number.isFinite(parsed)) return false
    if (parsed === value) return true
    // 12.5 in the answer against 12.50 in the source is the same number
    return Math.abs(parsed - value) < 1e-9
  })
}

function labelAppearsIn(label: string, text: string): boolean {
  const wanted = significantWords(label)
  // a label such as "2024" or "Q1" has no significant words, so the number carries the check
  if (wanted.size === 0) return true
  const found = significantWords(text)
  let matched = 0
  for (const word of wanted) if (found.has(word)) matched++
  return matched / wanted.size >= CHART_LABEL_OVERLAP_THRESHOLD
}

function pointIsGrounded(point: ChartPoint, passages: string[]): boolean {
  // a point that names its source is checked against that source alone, otherwise against any
  const candidates =
    point.source !== undefined && passages[point.source - 1] !== undefined
      ? [passages[point.source - 1]]
      : passages

  return candidates.some(
    (passage) => numberAppearsIn(point.value, passage) && labelAppearsIn(point.label, passage)
  )
}

/**
 * Marks each point as verified or not. Points are never removed: a chart with an unverified
 * point is still useful, as long as the reader is told which point to check.
 */
export function verifyChart(chart: Chart, passages: string[]): Chart {
  return {
    ...chart,
    points: chart.points.map((point) => ({
      ...point,
      verified: pointIsGrounded(point, passages),
    })),
  }
}

export function chartIsFullyGrounded(chart: Chart): boolean {
  return chart.points.every((point) => point.verified === true)
}

/**
 * Finds every chart block in an answer, checks its points against the full passages, and
 * writes the verdict back into the block. This runs on the server, where the whole passage
 * is available; the browser only ever sees a short snippet, which is too little to check against.
 */
export function verifyChartsIn(answer: string, passages: string[]): string {
  return answer.replace(/```chart\s*\n([\s\S]*?)```/g, (whole, source: string) => {
    const chart = parseChart(source)
    if (!chart) return whole
    const verified = verifyChart(chart, passages)
    return '```chart\n' + JSON.stringify(verified) + '\n```'
  })
}
