import { describe, it, expect } from 'vitest'
import { geminiFailure, geminiErrorMessage } from '@/lib/gemini'

// what google actually sends back, trimmed to the part that names the quota
const DAILY = JSON.stringify({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    details: [{ violations: [{ quotaMetric: 'generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
  },
})

const PER_MINUTE = JSON.stringify({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }],
  },
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
  it('says the quota resets tomorrow, instead of suggesting a pointless retry', () => {
    const message = geminiErrorMessage(429, DAILY)
    expect(message).toContain('resets tomorrow')
    expect(message).not.toContain('in a moment')
  })

  it('asks for a retry when waiting would actually help', () => {
    expect(geminiErrorMessage(429, PER_MINUTE)).toContain('try again in a minute')
    expect(geminiErrorMessage(503, '')).toContain('try again in a moment')
  })

  it('gives different advice for the two reasons a 429 happens', () => {
    expect(geminiErrorMessage(429, DAILY)).not.toBe(geminiErrorMessage(429, PER_MINUTE))
  })
})
