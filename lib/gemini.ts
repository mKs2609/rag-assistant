const GEMINI_MODEL = 'gemini-flash-latest'
const MAX_ATTEMPTS = 3
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// the flash models think before answering by default, which measured at 19 seconds a call
// against 3 seconds with this set. every answer here is drawn from passages we already
// supply, so there is little for the model to reason its way to. the model still reports
// some thinking, so this reduces it rather than switching it off.
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } }

export function withoutThinking(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body
  const fields = body as Record<string, unknown>
  const existing = (fields.generationConfig ?? {}) as Record<string, unknown>
  // a caller that sets its own thinkingConfig keeps it
  return { ...fields, generationConfig: { ...NO_THINKING, ...existing } }
}

export interface CallOptions {
  onRetry?: (attempt: number) => void
  maxAttempts?: number
  /** give up on a single request after this long. a 503 has been seen to hang for 61s,
   *  which on a caller working through a list eats the time left for everything after it */
  timeoutMs?: number
}

// gemini often returns 503 when it's busy, usually gone after a second or two.
//
// maxAttempts is worth lowering for a caller that works through a list. a retry a second
// later cannot clear a per minute limit, which lasts a minute, so it fails again and the
// free tier has one fewer request left for the rest of the list. pacing the list beats
// retrying inside it.
export async function callGemini(
  method: 'generateContent' | 'streamGenerateContent',
  body: unknown,
  { onRetry, maxAttempts = MAX_ATTEMPTS, timeoutMs }: CallOptions = {}
): Promise<Response> {
  const query = method === 'streamGenerateContent' ? '?alt=sse' : ''
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${method}${query}`
  const payload = JSON.stringify(withoutThinking(body))

  for (let attempt = 1; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY ?? '',
        },
        body: payload,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      })
    } catch (err) {
      // a timeout reads like the model being busy, because that is what caused it
      if (attempt >= maxAttempts) {
        console.error('Gemini request did not complete:', err)
        return new Response('{"error":{"code":503,"message":"request timed out"}}', { status: 503 })
      }
      onRetry?.(attempt)
      await sleep(1000 * 2 ** (attempt - 1))
      continue
    }

    if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt >= maxAttempts) {
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
