const GEMINI_MODEL = 'gemini-flash-latest'
const MAX_ATTEMPTS = 3
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// gemini often returns 503 when it's busy, usually gone after a second or two
export async function callGemini(
  method: 'generateContent' | 'streamGenerateContent',
  body: unknown,
  onRetry?: (attempt: number) => void
): Promise<Response> {
  const query = method === 'streamGenerateContent' ? '?alt=sse' : ''
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${method}${query}`

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY ?? '',
      },
      body: JSON.stringify(body),
    })

    if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt >= MAX_ATTEMPTS) {
      return res
    }

    await res.body?.cancel()
    onRetry?.(attempt)
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

// a 429 is either "too many in the last minute", which passes, or "that is all for today",
// which does not. the two need opposite responses, so they are told apart by the quota the
// error names rather than being reported together as the model being busy.
export type Failure = 'quota-daily' | 'quota-rate' | 'busy' | 'other'

export function geminiFailure(status: number, body = ''): Failure {
  if (status === 429) {
    if (/per\s*day|PerDay/i.test(body)) return 'quota-daily'
    return 'quota-rate'
  }
  if (status === 503) return 'busy'
  return 'other'
}

// the daily quota resets at midnight Pacific, not at midnight wherever you are, so saying
// "tomorrow" sends people back too early. google puts the real wait in the error, as
// "retryDelay": "21046s", and that is worth more than any guess about the calendar.
export function retryAfter(body: string): string {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (!match) return ''
  const seconds = Number(match[1])
  if (seconds < 90) return 'about a minute'
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} minutes`
  const hours = Math.round(seconds / 3600)
  return hours === 1 ? 'about an hour' : `about ${hours} hours`
}

export function geminiErrorMessage(status: number, body = ''): string {
  const failure = geminiFailure(status, body)
  if (failure === 'quota-rate') return 'Too many requests to the AI model just now. Please try again in a minute.'
  if (failure === 'busy') return 'The AI model is busy right now. Please try again in a moment.'
  if (failure === 'other') return 'The AI service returned an error. Please try again.'

  const wait = retryAfter(body)
  return wait
    ? `The daily free quota for the AI model is used up. Try again in ${wait}.`
    : 'The daily free quota for the AI model is used up. It resets at midnight Pacific time.'
}
