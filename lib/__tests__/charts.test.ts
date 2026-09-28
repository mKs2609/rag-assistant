import { describe, it, expect } from 'vitest'
import { numberAppearsIn, verifyChart, chartIsFullyGrounded, verifyChartsIn } from '@/lib/charts'
import { parseChart, parseBlocks } from '@/lib/markdown'
import type { Chart } from '@/lib/markdown'

const PASSAGES = [
  'Revenue by quarter. Q1 revenue was 1,240 lakh. Q2 revenue was 1560 lakh.',
  'Headcount grew steadily. Engineering had 42 people and Support had 17 people.',
]

function chart(points: Chart['points'], kind: Chart['kind'] = 'bar'): Chart {
  return { kind, title: 'Test', points }
}

describe('numberAppearsIn', () => {
  it('finds a plain number', () => {
    expect(numberAppearsIn(42, 'Engineering had 42 people')).toBe(true)
  })

  it('finds a number written with thousands separators', () => {
    expect(numberAppearsIn(1240, 'revenue was 1,240 lakh')).toBe(true)
  })

  it('treats a trailing zero after the point as the same number', () => {
    expect(numberAppearsIn(12.5, 'the rate was 12.50 per cent')).toBe(true)
  })

  it('does not match a number that is merely similar', () => {
    expect(numberAppearsIn(1240, 'revenue was 1241 lakh')).toBe(false)
  })

  it('does not match a number that is only part of a longer one', () => {
    expect(numberAppearsIn(24, 'the code is 1240')).toBe(false)
  })

  it('returns false when the text has no numbers at all', () => {
    expect(numberAppearsIn(5, 'no figures here')).toBe(false)
  })

  it('finds a negative number', () => {
    expect(numberAppearsIn(-3, 'the change was -3 per cent')).toBe(true)
  })
})

describe('verifyChart', () => {
  it('verifies a point whose label and value both appear', () => {
    const result = verifyChart(chart([
      { label: 'Engineering', value: 42 },
      { label: 'Support', value: 17 },
    ]), PASSAGES)
    expect(result.points.map((p) => p.verified)).toEqual([true, true])
    expect(chartIsFullyGrounded(result)).toBe(true)
  })

  it('rejects an invented value even when the label is real', () => {
    const result = verifyChart(chart([
      { label: 'Engineering', value: 42 },
      { label: 'Support', value: 99 },
    ]), PASSAGES)
    expect(result.points.map((p) => p.verified)).toEqual([true, false])
    expect(chartIsFullyGrounded(result)).toBe(false)
  })

  it('rejects a real value attached to a label that is not in the source', () => {
    const result = verifyChart(chart([{ label: 'Marketing', value: 42 }]), PASSAGES)
    expect(result.points[0].verified).toBe(false)
  })

  it('checks a point against the source it names, not any source', () => {
    // 42 is in passage 2, so claiming it came from passage 1 should not verify
    const wrong = verifyChart(chart([{ label: 'Engineering', value: 42, source: 1 }]), PASSAGES)
    expect(wrong.points[0].verified).toBe(false)

    const right = verifyChart(chart([{ label: 'Engineering', value: 42, source: 2 }]), PASSAGES)
    expect(right.points[0].verified).toBe(true)
  })

  it('accepts a label with no significant words when the number is present', () => {
    const result = verifyChart(chart([{ label: 'Q1', value: 1240 }]), PASSAGES)
    expect(result.points[0].verified).toBe(true)
  })

  it('never drops points, it only marks them', () => {
    const result = verifyChart(chart([
      { label: 'Engineering', value: 42 },
      { label: 'Nonsense', value: 12345 },
    ]), PASSAGES)
    expect(result.points).toHaveLength(2)
  })

  it('marks everything unverified when there are no passages', () => {
    const result = verifyChart(chart([{ label: 'Engineering', value: 42 }]), [])
    expect(result.points[0].verified).toBe(false)
  })
})

describe('parseChart', () => {
  it('reads a well formed chart', () => {
    const parsed = parseChart('{"kind":"bar","title":"Revenue","unit":"lakh","points":[{"label":"Q1","value":1240,"source":1},{"label":"Q2","value":1560,"source":1}]}')
    expect(parsed).not.toBeNull()
    expect(parsed!.kind).toBe('bar')
    expect(parsed!.unit).toBe('lakh')
    expect(parsed!.points).toHaveLength(2)
    expect(parsed!.points[0].source).toBe(1)
  })

  it('accepts a value written as a string with separators', () => {
    const parsed = parseChart('{"title":"t","points":[{"label":"a","value":"1,240"},{"label":"b","value":2}]}')
    expect(parsed!.points[0].value).toBe(1240)
  })

  it('drops a point with no usable value but keeps the rest', () => {
    const parsed = parseChart('{"title":"t","points":[{"label":"a","value":"not a number"},{"label":"b","value":2},{"label":"c","value":3}]}')
    expect(parsed!.points.map((p) => p.label)).toEqual(['b', 'c'])
  })

  it('refuses a chart with fewer than two usable points', () => {
    expect(parseChart('{"title":"t","points":[{"label":"a","value":1}]}')).toBeNull()
  })

  it('refuses malformed json rather than throwing', () => {
    expect(parseChart('{not json')).toBeNull()
    expect(parseChart('')).toBeNull()
    expect(parseChart('[1,2,3]')).toBeNull()
  })

  it('defaults an unknown kind to a bar chart', () => {
    const parsed = parseChart('{"kind":"pie","title":"t","points":[{"label":"a","value":1},{"label":"b","value":2}]}')
    expect(parsed!.kind).toBe('bar')
  })
})

describe('chart blocks inside an answer', () => {
  it('is picked up as a chart block', () => {
    const blocks = parseBlocks(
      'Here is the split.\n\n```chart\n{"title":"Headcount","points":[{"label":"Engineering","value":42},{"label":"Support","value":17}]}\n```\n\nThat is the whole team.'
    )
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'chart', 'paragraph'])
  })

  it('falls back to a code block when the chart cannot be read', () => {
    const blocks = parseBlocks('```chart\n{broken\n```')
    expect(blocks[0].type).toBe('code')
  })

  it('leaves an ordinary code block alone', () => {
    const blocks = parseBlocks('```json\n{"points":[]}\n```')
    expect(blocks[0].type).toBe('code')
  })
})

describe('verifyChartsIn', () => {
  const answer = [
    'Here is the split [2].',
    '',
    '```chart',
    '{"kind":"bar","title":"Headcount","points":[{"label":"Engineering","value":42,"source":2},{"label":"Support","value":99,"source":2}]}',
    '```',
  ].join('\n')

  it('writes the verdict for each point back into the answer', () => {
    const out = verifyChartsIn(answer, PASSAGES)
    const block = out.match(/```chart\n([\s\S]*?)\n```/)
    expect(block).not.toBeNull()
    const chart = JSON.parse(block![1])
    expect(chart.points[0].verified).toBe(true)
    expect(chart.points[1].verified).toBe(false)
  })

  it('leaves the prose around the chart untouched', () => {
    expect(verifyChartsIn(answer, PASSAGES)).toContain('Here is the split [2].')
  })

  it('leaves an answer with no chart exactly as it was', () => {
    const plain = 'Just a sentence with a number 42 in it.'
    expect(verifyChartsIn(plain, PASSAGES)).toBe(plain)
  })

  it('leaves a malformed chart block alone rather than dropping it', () => {
    const broken = '```chart\n{not json\n```'
    expect(verifyChartsIn(broken, PASSAGES)).toBe(broken)
  })

  it('handles several charts in one answer', () => {
    const two = answer + '\n\n' + answer
    const out = verifyChartsIn(two, PASSAGES)
    expect(out.match(/"verified":true/g)).toHaveLength(2)
    expect(out.match(/"verified":false/g)).toHaveLength(2)
  })
})
