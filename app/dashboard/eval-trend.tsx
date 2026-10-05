'use client'

import { ACCENT } from '@/lib/theme'
import { toPoints, toPath, changeAcross, formatPercent, formatChange, type EvalRun } from '@/lib/trend'

const VIEW_WIDTH = 520
const VIEW_HEIGHT = 115
// the first and last point sit on the edge of the plot, so pad the box or they draw clipped in half
const PAD_X = 10
const PAD_Y = 10
const WIDTH = VIEW_WIDTH - PAD_X * 2
const HEIGHT = VIEW_HEIGHT - PAD_Y * 2
const ANSWER_COLOUR = '#8a8c93'

function Series({
  values,
  colour,
  dashed,
}: {
  values: (number | null)[]
  colour: string
  dashed?: boolean
}) {
  const points = toPoints(values, WIDTH, HEIGHT)
  const path = toPath(points)
  return (
    <>
      {path && (
        <path
          d={path}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      )}
      {points.map((point, i) =>
        point ? <circle key={i} cx={point.x} cy={point.y} r={2.5} fill={colour} /> : null
      )}
    </>
  )
}

export default function EvalTrend({ runs }: { runs: EvalRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-bone/70">
        No past runs yet. Run the evaluation and each result is kept here, so you can see whether a
        change to retrieval helped or hurt.
      </p>
    )
  }

  const retrieval = runs.map((r) => r.retrievalAccuracy)
  const answer = runs.map((r) => r.answerAccuracy)
  const latest = runs[runs.length - 1]
  const total = latest.scoredCount + latest.skippedCount
  const retrievalChange = changeAcross(retrieval)
  const answerChange = changeAcross(answer)
  const anyGap = runs.some((r) => r.retrievalAccuracy === null || r.answerAccuracy === null)

  return (
    <div className="bg-inkwell rounded-lg p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <p className="text-xs font-bold text-bone uppercase tracking-wider">
          Accuracy over the last {runs.length} run{runs.length === 1 ? '' : 's'}
        </p>
        {/* the two are measured over different numbers of questions whenever the model was
            unavailable, so one shared coverage figure would misdescribe at least one of them */}
        <p className="text-xs text-bone/70">
          Latest: {formatPercent(latest.retrievalAccuracy)} retrieval from{' '}
          {latest.retrievalScoredCount} of {total},{' '}
          {formatPercent(latest.answerAccuracy)} answer from{' '}
          <span className={latest.skippedCount > 0 ? 'text-red-400' : ''}>
            {latest.scoredCount} of {total}
          </span>
        </p>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Retrieval accuracy ${formatPercent(latest.retrievalAccuracy)}, answer accuracy ${formatPercent(latest.answerAccuracy)}, across ${runs.length} runs`}
      >
        <g transform={`translate(${PAD_X}, ${PAD_Y})`}>
          {[0, 0.5, 1].map((level) => (
            <line
              key={level}
              x1={0}
              x2={WIDTH}
              y1={HEIGHT - level * HEIGHT}
              y2={HEIGHT - level * HEIGHT}
              stroke="#403f3f"
              strokeWidth={1}
            />
          ))}
          <Series values={answer} colour={ANSWER_COLOUR} dashed />
          <Series values={retrieval} colour={ACCENT} />
        </g>
      </svg>

      <div className="flex gap-5 text-xs text-bone/70 flex-wrap">
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-0.5" style={{ backgroundColor: ACCENT }} />
          Retrieval {retrievalChange !== null && `(${formatChange(retrievalChange)})`}
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-4 h-0.5"
            style={{ backgroundColor: ANSWER_COLOUR, opacity: 0.8 }}
          />
          Answer {answerChange !== null && `(${formatChange(answerChange)})`}
        </span>
      </div>

      {anyGap && (
        <p className="text-xs text-bone/70">
          A break in a line is a run where the model was unavailable, not a score of zero.
        </p>
      )}
    </div>
  )
}
