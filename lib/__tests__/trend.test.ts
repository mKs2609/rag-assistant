import { describe, it, expect } from 'vitest'
import { toPoints, toPath, changeAcross, formatPercent, formatChange } from '@/lib/trend'

describe('toPoints', () => {
  it('spreads runs from the left edge to the right edge', () => {
    const points = toPoints([0, 0.5, 1], 100, 50)
    expect(points[0]).toEqual({ x: 0, y: 50 })
    expect(points[1]).toEqual({ x: 50, y: 25 })
    expect(points[2]).toEqual({ x: 100, y: 0 })
  })

  it('puts a single run in the middle rather than against the left edge', () => {
    expect(toPoints([1], 100, 50)).toEqual([{ x: 50, y: 0 }])
  })

  it('puts a perfect score at the top and a zero at the bottom', () => {
    const points = toPoints([1, 0], 10, 40)
    expect(points[0]!.y).toBe(0)
    expect(points[1]!.y).toBe(40)
  })

  it('leaves a gap for a run that was never scored', () => {
    const points = toPoints([1, null, 0.5], 100, 50)
    expect(points[1]).toBeNull()
    expect(points[0]).not.toBeNull()
    expect(points[2]).not.toBeNull()
  })

  it('clamps a value outside zero to one rather than drawing outside the box', () => {
    const points = toPoints([1.4, -0.3], 10, 40)
    expect(points[0]!.y).toBe(0)
    expect(points[1]!.y).toBe(40)
  })

  it('returns nothing for no runs', () => {
    expect(toPoints([], 100, 50)).toEqual([])
  })
})

describe('toPath', () => {
  it('draws a line through consecutive points', () => {
    expect(toPath(toPoints([0, 1], 100, 50))).toBe('M 0 50 L 100 0')
  })

  it('breaks the line where a run has no score, so a gap is not read as a drop to zero', () => {
    const path = toPath(toPoints([1, null, 1], 100, 50))
    expect(path).toBe('M 0 0 M 100 0')
    expect(path).not.toContain('L')
  })

  it('returns an empty path when nothing was scored', () => {
    expect(toPath(toPoints([null, null], 100, 50))).toBe('')
  })

  it('starts a fresh line after a gap rather than joining across it', () => {
    const path = toPath(toPoints([0.5, 0.5, null, 0.5, 0.5], 100, 50))
    expect(path.match(/M /g)).toHaveLength(2)
    expect(path.match(/L /g)).toHaveLength(2)
  })
})

describe('changeAcross', () => {
  it('measures from the first scored run to the last', () => {
    expect(changeAcross([0.5, 0.75])).toBeCloseTo(0.25)
  })

  it('ignores unscored runs at either end', () => {
    expect(changeAcross([null, 0.5, 0.75, null])).toBeCloseTo(0.25)
  })

  it('reports a fall as a negative number', () => {
    expect(changeAcross([0.8, 0.6])).toBeCloseTo(-0.2)
  })

  it('has nothing to compare with fewer than two scored runs', () => {
    expect(changeAcross([0.5])).toBeNull()
    expect(changeAcross([null, 0.5])).toBeNull()
    expect(changeAcross([])).toBeNull()
  })
})

describe('formatting', () => {
  it('shows a score as a whole percentage', () => {
    expect(formatPercent(0.833)).toBe('83%')
    expect(formatPercent(1)).toBe('100%')
  })

  it('says plainly when there is no score, rather than showing zero', () => {
    expect(formatPercent(null)).toBe('not scored')
  })

  it('describes a change in percentage points', () => {
    expect(formatChange(0.25)).toBe('up 25 points')
    expect(formatChange(-0.2)).toBe('down 20 points')
    expect(formatChange(0)).toBe('no change')
  })

  it('says nothing when there is no change to describe', () => {
    expect(formatChange(null)).toBe('')
  })
})
