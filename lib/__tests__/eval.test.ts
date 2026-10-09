import { describe, it, expect } from 'vitest'
import { answerIsCorrect, keywordsFoundIn, rotate, scoreRun, significantWords } from '@/lib/eval'

describe('significantWords', () => {
  it('drops the short and common words that match anything', () => {
    expect([...significantWords('The answer is in the document')]).toEqual(['answer', 'document'])
  })

  it('ignores punctuation, so a word at the end of a sentence still counts', () => {
    expect(significantWords('Issued March 2026.').has('2026')).toBe(true)
  })
})

describe('answerIsCorrect', () => {
  it('passes when half the expected keywords appear', () => {
    expect(answerIsCorrect('Issued in March 2026', ['march', '2026'])).toBe(true)
    expect(answerIsCorrect('Issued in March', ['march', '2026'])).toBe(true)
  })

  it('fails when fewer than half appear', () => {
    expect(answerIsCorrect('Issued recently', ['march', '2026', 'ibm', 'certificate'])).toBe(false)
  })

  it('lets either wording pass when a question expects one of two', () => {
    const expected = ['information', 'mention']
    expect(answerIsCorrect('There is no information about the salary.', expected)).toBe(true)
    expect(answerIsCorrect('The documents do not mention a salary.', expected)).toBe(true)
  })

  it('counts a question with no expected keywords as correct', () => {
    expect(answerIsCorrect('anything at all', [])).toBe(true)
  })

  it('matches regardless of case', () => {
    expect(answerIsCorrect('Issued by IBM SkillsBuild', ['ibm', 'skillsbuild'])).toBe(true)
  })
})

describe('keywordsFoundIn', () => {
  it('reports which keywords were matched, for showing why a question failed', () => {
    expect(keywordsFoundIn('Issued in March', ['march', '2026'])).toEqual(['march'])
  })
})

describe('scoreRun', () => {
  it('measures retrieval and the answer over the questions each actually covered', () => {
    const score = scoreRun([
      { retrievalHit: true, answerCorrect: true },
      { retrievalHit: true, answerCorrect: null },
      { retrievalHit: false, answerCorrect: null },
    ])
    expect(score.retrievalScored).toBe(3)
    expect(score.retrievalAccuracy).toBeCloseTo(2 / 3)
    expect(score.answerScored).toBe(1)
    expect(score.answerAccuracy).toBe(1)
    expect(score.total).toBe(3)
  })

  it('keeps a full retrieval score when the model answered nothing', () => {
    const score = scoreRun(
      Array.from({ length: 22 }, () => ({ retrievalHit: true, answerCorrect: null }))
    )
    expect(score.retrievalAccuracy).toBe(1)
    expect(score.retrievalScored).toBe(22)
    expect(score.answerAccuracy).toBeNull()
    expect(score.answerScored).toBe(0)
  })

  it('does not let an unmeasured question count as a failure', () => {
    const score = scoreRun([
      { retrievalHit: true, answerCorrect: true },
      { retrievalHit: null, answerCorrect: null },
    ])
    expect(score.retrievalAccuracy).toBe(1)
    expect(score.retrievalScored).toBe(1)
  })

  it('has no score to report when nothing was measured', () => {
    const score = scoreRun([{ retrievalHit: null, answerCorrect: null }])
    expect(score.retrievalAccuracy).toBeNull()
    expect(score.answerAccuracy).toBeNull()
    expect(score.total).toBe(1)
  })

  it('reports zero rather than nothing when every measured question failed', () => {
    const score = scoreRun([{ retrievalHit: false, answerCorrect: false }])
    expect(score.retrievalAccuracy).toBe(0)
    expect(score.answerAccuracy).toBe(0)
  })

  it('scores an empty run as nothing at all', () => {
    expect(scoreRun([])).toEqual({
      retrievalAccuracy: null,
      retrievalScored: 0,
      answerAccuracy: null,
      answerScored: 0,
      total: 0,
    })
  })
})

describe('rotate', () => {
  const set = ['a', 'b', 'c', 'd']

  it('leaves the first run in the order the questions were written', () => {
    expect(rotate(set, 0)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('starts one further along on each following run', () => {
    expect(rotate(set, 1)).toEqual(['b', 'c', 'd', 'a'])
    expect(rotate(set, 2)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('gives every question a turn at the front within one cycle', () => {
    const leaders = set.map((_, run) => rotate(set, run)[0])
    expect(new Set(leaders).size).toBe(set.length)
  })

  it('brings the tail to the front, which is the whole point', () => {
    // a run that only reaches two questions scores a and b, then c and d next time
    expect(rotate(set, 2).slice(0, 2)).toEqual(['c', 'd'])
  })

  it('comes back round once the runs pass the number of questions', () => {
    expect(rotate(set, 4)).toEqual(set)
    expect(rotate(set, 5)).toEqual(rotate(set, 1))
  })

  it('keeps every question exactly once, whatever the offset', () => {
    expect([...rotate(set, 3)].sort()).toEqual([...set].sort())
  })

  it('does not change the caller\'s array', () => {
    const original = [...set]
    rotate(set, 2)
    expect(set).toEqual(original)
  })

  it('copes with an empty set and with one question', () => {
    expect(rotate([], 3)).toEqual([])
    expect(rotate(['only'], 7)).toEqual(['only'])
  })
})
