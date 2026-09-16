const GEMINI_MODEL = 'gemini-flash-latest'
const MAX_ATTEMPTS = 3
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// gemini often returns 503 when it's busy, usually gone after a second or two
export async function callGemini(
  method: 'generateContent' | 'streamGenerateContent',
  body: unknown
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
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

export function geminiErrorMessage(status: number): string {
  if (status === 429 || status === 503) {
    return 'The AI model is busy right now. Please try again in a moment.'
  }
  return 'The AI service returned an error. Please try again.'
}
