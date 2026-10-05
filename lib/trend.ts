// geometry for the evaluation trend chart, kept out of the component so it can be tested

export interface EvalRun {
  id: string
  retrievalAccuracy: number | null
  answerAccuracy: number | null
  /** questions whose retrieval was measured, which the model cannot stop */
  retrievalScoredCount: number
  scoredCount: number
  skippedCount: number
  createdAt: string
}

export interface Point {
  x: number
  y: number
}

/**
 * Turns a list of accuracies into points inside a box of the given size. Runs where every
 * question errored have no score, so they leave a gap rather than being drawn as zero.
 */
export function toPoints(
  values: (number | null)[],
  width: number,
  height: number
): (Point | null)[] {
  if (values.length === 0) return []
  // a single run sits in the middle, otherwise the first and last touch the edges
  const step = values.length === 1 ? 0 : width / (values.length - 1)
  const offset = values.length === 1 ? width / 2 : 0

  return values.map((value, i) => {
    if (value === null || !Number.isFinite(value)) return null
    const clamped = Math.min(Math.max(value, 0), 1)
    return { x: offset + i * step, y: height - clamped * height }
  })
}

/**
 * An SVG path across the points, breaking the line wherever a run has no score so that
 * a gap reads as missing data rather than as a drop to zero.
 */
export function toPath(points: (Point | null)[]): string {
  const parts: string[] = []
  let penDown = false

  for (const point of points) {
    if (point === null) {
      penDown = false
      continue
    }
    const x = round(point.x)
    const y = round(point.y)
    parts.push(`${penDown ? 'L' : 'M'} ${x} ${y}`)
    penDown = true
  }

  return parts.join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** The change between the first and last run that has a score, as a fraction. */
export function changeAcross(values: (number | null)[]): number | null {
  const scored = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (scored.length < 2) return null
  return scored[scored.length - 1] - scored[0]
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'not scored'
  return `${Math.round(value * 100)}%`
}

export function formatChange(value: number | null): string {
  if (value === null) return ''
  const points = Math.round(value * 100)
  if (points === 0) return 'no change'
  return `${points > 0 ? 'up' : 'down'} ${Math.abs(points)} points`
}
