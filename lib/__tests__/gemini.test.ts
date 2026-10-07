import { describe, it, expect } from 'vitest'
import { geminiFailure, geminiErrorMessage, retryAfter, withoutThinking } from '@/lib/gemini'

// what google actually sends back, trimmed to the part that names the quota
const DAILY = JSON.stringify({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    details: [
      { violations: [{ quotaMetric: 'generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '21046s' },
    ],
  },
})

const PER_MINUTE = JSON.stringify({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }],
  },
})

describe('retryAfter', () => {
  it('turns the seconds google sends into something readable', () => {
    expect(retryAfter('"retryDelay": "21046s"')).toBe('about 6 hours')
    expect(retryAfter('"retryDelay": "3400s"')).toBe('about 57 minutes')
    expect(retryAfter('"retryDelay": "45s"')).toBe('about a minute')
  })

  it('says an hour rather than 1 hours', () => {
    expect(retryAfter('"retryDelay": "3700s"')).toBe('about an hour')
  })

  it('stays in minutes right up to the hour, rather than rounding away the detail', () => {
    expect(retryAfter('"retryDelay": "3500s"')).toBe('about 58 minutes')
  })

  it('reads the fractional seconds google sometimes sends', () => {
    expect(retryAfter('"retryDelay": "7200.5s"')).toBe('about 2 hours')
  })

  it('gives nothing when the error carries no wait', () => {
    expect(retryAfter('{"error":{"code":429}}')).toBe('')
  })
})

const PER_DAY_NO_DELAY = JSON.stringify({
  error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] },
})

describe('geminiFailure', () => {
  it('tells the daily quota apart from the per minute one, because only one of them passes', () => {
    expect(geminiFailure(429, DAILY)).toBe('quota-daily')
    expect(geminiFailure(429, PER_MINUTE)).toBe('quota-rate')
  })

  it('treats an unlabelled 429 as the per minute limit, the one worth retrying', () => {
    expect(geminiFailure(429, '')).toBe('quota-rate')
  })

  it('calls a 503 busy rather than a quota problem', () => {
    expect(geminiFailure(503, '')).toBe('busy')
  })

  it('does not read a quota into some other failure', () => {
    expect(geminiFailure(500, 'per day')).toBe('other')
    expect(geminiFailure(400, '')).toBe('other')
  })
})

describe('geminiErrorMessage', () => {
  it("quotes google's own wait instead of guessing at the calendar", () => {
    const message = geminiErrorMessage(429, DAILY)
    expect(message).toContain('about 6 hours')
    expect(message).not.toContain('in a moment')
  })

  it('falls back to the reset time, not to "tomorrow", when no wait is given', () => {
    const message = geminiErrorMessage(429, PER_DAY_NO_DELAY)
    expect(message).toContain('midnight Pacific')
    expect(message).not.toContain('tomorrow')
  })

  it('asks for a retry when waiting would actually help', () => {
    expect(geminiErrorMessage(429, PER_MINUTE)).toContain('try again in a minute')
    expect(geminiErrorMessage(503, '')).toContain('try again in a moment')
  })

  it('gives different advice for the two reasons a 429 happens', () => {
    expect(geminiErrorMessage(429, DAILY)).not.toBe(geminiErrorMessage(429, PER_MINUTE))
  })
})

describe('withoutThinking', () => {
  const ask = { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }

  it('asks the model not to think, because the answer is in the passages already', () => {
    const sent = withoutThinking(ask) as Record<string, never>
    expect(sent.generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 0 } })
  })

  it('leaves the rest of the request alone', () => {
    const sent = withoutThinking({ ...ask, systemInstruction: { parts: [{ text: 'rules' }] } }) as {
      contents: unknown
      systemInstruction: unknown
    }
    expect(sent.contents).toEqual(ask.contents)
    expect(sent.systemInstruction).toEqual({ parts: [{ text: 'rules' }] })
  })

  it('keeps other generation settings a caller has set', () => {
    const sent = withoutThinking({ ...ask, generationConfig: { temperature: 0.2 } }) as {
      generationConfig: Record<string, unknown>
    }
    expect(sent.generationConfig.temperature).toBe(0.2)
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('does not override a caller that asked for thinking on purpose', () => {
    const sent = withoutThinking({
      ...ask,
      generationConfig: { thinkingConfig: { thinkingBudget: 2048 } },
    }) as { generationConfig: { thinkingConfig: unknown } }
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 2048 })
  })

  it('hands back anything that is not a request object untouched', () => {
    expect(withoutThinking(null)).toBeNull()
    expect(withoutThinking('text')).toBe('text')
    expect(withoutThinking([1, 2])).toEqual([1, 2])
  })
})
