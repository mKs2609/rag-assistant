// the chat answer arrives as one JSON object per line. a network chunk does not respect
// line boundaries, so an object can be split across two reads and has to be held until the
// rest of it turns up. that logic lived inside the component, welded to react state, where
// it could not be tested: if it were wrong, tokens would vanish from the middle of an
// answer and nothing would say so.

/** what is left over after taking the complete lines out of what has arrived so far */
export interface Read<T> {
  events: T[]
  /** the unfinished last line, to be given back on the next read */
  rest: string
}

export function readEvents<T>(chunk: string, carried = ''): Read<T> {
  const lines = (carried + chunk).split('\n')
  // the last piece has no newline after it yet, so it may be half an object
  const rest = lines.pop() ?? ''
  const events: T[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as T)
    } catch {
      // a line that is not JSON is dropped rather than ending the answer
    }
  }

  return { events, rest }
}
