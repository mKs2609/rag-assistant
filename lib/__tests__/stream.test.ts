import { describe, it, expect } from 'vitest'
import { readEvents } from '@/lib/stream'

interface Event {
  type: string
  text?: string
}

describe('readEvents', () => {
  it('reads whole objects out of one chunk', () => {
    const read = readEvents<Event>('{"type":"token","text":"Hello"}\n{"type":"token","text":" world"}\n')
    expect(read.events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ' world' },
    ])
    expect(read.rest).toBe('')
  })

  it('holds a half finished line back instead of dropping it', () => {
    const read = readEvents<Event>('{"type":"token","text":"Hel')
    expect(read.events).toEqual([])
    expect(read.rest).toBe('{"type":"token","text":"Hel')
  })

  // this is the case the whole thing exists for: an event split across two network reads
  it('joins an object split across two chunks', () => {
    const first = readEvents<Event>('{"type":"token","te')
    const second = readEvents<Event>('xt":"Hello"}\n', first.rest)
    expect(first.events).toEqual([])
    expect(second.events).toEqual([{ type: 'token', text: 'Hello' }])
    expect(second.rest).toBe('')
  })

  it('survives a split landing exactly on the newline', () => {
    const first = readEvents<Event>('{"type":"token","text":"a"}')
    const second = readEvents<Event>('\n{"type":"token","text":"b"}\n', first.rest)
    expect(first.events).toEqual([])
    expect(second.events).toEqual([
      { type: 'token', text: 'a' },
      { type: 'token', text: 'b' },
    ])
  })

  it('reassembles an object spread over many tiny chunks', () => {
    const whole = '{"type":"done","text":"ok"}\n'
    let carried = ''
    const events: Event[] = []
    for (const char of whole) {
      const read = readEvents<Event>(char, carried)
      carried = read.rest
      events.push(...read.events)
    }
    expect(events).toEqual([{ type: 'done', text: 'ok' }])
    expect(carried).toBe('')
  })

  it('skips blank lines rather than treating them as events', () => {
    const read = readEvents<Event>('\n\n{"type":"token"}\n\n')
    expect(read.events).toEqual([{ type: 'token' }])
  })

  it('drops a line that is not JSON and keeps the rest of the answer', () => {
    const read = readEvents<Event>('not json\n{"type":"token","text":"still here"}\n')
    expect(read.events).toEqual([{ type: 'token', text: 'still here' }])
  })

  it('returns nothing for an empty chunk and keeps what was carried', () => {
    expect(readEvents<Event>('')).toEqual({ events: [], rest: '' })
    expect(readEvents<Event>('', '{"half"')).toEqual({ events: [], rest: '{"half"' })
  })
})
