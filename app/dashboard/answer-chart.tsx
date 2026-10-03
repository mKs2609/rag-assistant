import { ACCENT } from '@/lib/theme'
import { groundingState } from '@/lib/charts'
import type { Chart } from '@/lib/markdown'

const HEIGHT = 170
const BAR_GAP = 10

function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const steps = [1, 2, 2.5, 5, 10]
  for (const step of steps) {
    const candidate = step * magnitude
    if (candidate >= value) return candidate
  }
  return 10 * magnitude
}

function format(value: number, unit?: string): string {
  const shown = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)
  return unit ? `${shown} ${unit}` : shown
}

export default function AnswerChart({ chart }: { chart: Chart }) {
  const values = chart.points.map((p) => p.value)
  const highest = Math.max(...values, 0)
  const lowest = Math.min(...values, 0)
  const top = niceCeiling(highest)
  // a chart with negative values needs room below the baseline
  const bottom = lowest < 0 ? -niceCeiling(Math.abs(lowest)) : 0
  const span = top - bottom || 1
  const zeroLine = (top / span) * HEIGHT
  const state = groundingState(chart)

  return (
    <figure className="my-4 bg-obsidian/40 rounded-lg p-4">
      {chart.title && (
        <figcaption className="font-display text-sm text-bone mb-1">{chart.title}</figcaption>
      )}

      <div className="flex items-end gap-2" style={{ height: HEIGHT }} role="presentation">
        {chart.points.map((point, i) => {
          const magnitude = (Math.abs(point.value) / span) * HEIGHT
          const height = Math.max(magnitude, 2)
          const unverified = point.verified === false
          const positive = point.value >= 0
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end items-center min-w-0"
              style={{ height: HEIGHT, paddingBottom: positive ? HEIGHT - zeroLine : 0 }}
            >
              <span className="text-[11px] text-pewter mb-1 whitespace-nowrap">
                {format(point.value, chart.unit)}
              </span>
              <div
                title={
                  unverified
                    ? 'This number was not found in the cited passage'
                    : `${point.label}: ${format(point.value, chart.unit)}`
                }
                style={{
                  height,
                  width: `calc(100% - ${BAR_GAP}px)`,
                  backgroundColor: unverified ? 'transparent' : ACCENT,
                  border: unverified ? `1px dashed ${ACCENT}` : undefined,
                  opacity: unverified ? 0.55 : 1,
                }}
                className="rounded-sm"
              />
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 mt-2">
        {chart.points.map((point, i) => (
          <span
            key={i}
            className="flex-1 text-[11px] text-pewter text-center truncate min-w-0"
            title={point.label}
          >
            {point.label}
            {point.verified === false && <span className="text-red-400"> *</span>}
          </span>
        ))}
      </div>

      {state !== 'unknown' && (
        <p className={`text-[11px] mt-3 ${state === 'verified' ? 'text-fog' : 'text-red-400'}`}>
          {state === 'verified'
            ? 'Every value above was found in the passages this answer cites.'
            : 'Values marked * were not found in the passage they were attributed to. Check those against the source.'}
        </p>
      )}
    </figure>
  )
}
