// the model answers in markdown. this turns that into blocks the chat can render,
// rather than pulling in a full markdown library for the handful of things gemini emits.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }

export interface ChartPoint {
  label: string
  value: number
  /** which source the number came from, 1 based, matching the [1] markers in the answer */
  source?: number
  /** set once the point has been checked against the passage it claims to come from */
  verified?: boolean
}

export interface Chart {
  kind: 'bar' | 'line'
  title: string
  unit?: string
  points: ChartPoint[]
}

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'bullets'; items: Inline[][] }
  | { type: 'numbers'; items: Inline[][] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { type: 'code'; language: string; text: string }
  | { type: 'chart'; chart: Chart }

const HEADING = /^(#{1,4})\s+(.*)$/
const BULLET = /^\s*[*-]\s+(.+)$/
const NUMBER = /^\s*\d+[.)]\s+(.+)$/
const FENCE = /^\s*```\s*(\S*)\s*$/
// a table row is | a | b |, and the divider under the head is |---|:--:|
const TABLE_ROW = /^\s*\|(.+)\|\s*$/
const TABLE_DIVIDER = /^\s*\|[\s:|-]+\|\s*$/

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  // `code` first, so ** inside a code span is left alone
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      out.push({ type: 'text', text: text.slice(last, match.index) })
    }
    const token = match[0]
    if (token.startsWith('`')) {
      out.push({ type: 'code', text: token.slice(1, -1) })
    } else if (token.startsWith('**')) {
      out.push({ type: 'bold', text: token.slice(2, -2) })
    } else {
      out.push({ type: 'italic', text: token.slice(1, -1) })
    }
    last = match.index + token.length
  }

  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out.length > 0 ? out : [{ type: 'text', text: '' }]
}

// the model is asked to put chart data in a ```chart block. it is model output, so every
// field is checked here rather than trusted, and anything unusable returns null.
export function parseChart(source: string): Chart | null {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null

  const data = raw as Record<string, unknown>
  const kind = data.kind === 'line' ? 'line' : 'bar'
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  const unit = typeof data.unit === 'string' && data.unit.trim() !== '' ? data.unit.trim() : undefined

  if (!Array.isArray(data.points)) return null

  const points: ChartPoint[] = []
  for (const entry of data.points) {
    if (typeof entry !== 'object' || entry === null) continue
    const point = entry as Record<string, unknown>
    const label = typeof point.label === 'string' ? point.label.trim() : ''
    // a value may arrive as a number or as a string such as "1,240"
    const value =
      typeof point.value === 'number'
        ? point.value
        : typeof point.value === 'string'
          ? Number(point.value.replace(/,/g, '').trim())
          : NaN
    if (label === '' || !Number.isFinite(value)) continue
    const source = typeof point.source === 'number' && point.source > 0 ? point.source : undefined
    const verified = typeof point.verified === 'boolean' ? point.verified : undefined
    points.push({ label, value, source, verified })
  }

  if (points.length < 2) return null
  return { kind, title, unit, points }
}

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = line.match(FENCE)
    if (fence) {
      flushParagraph()
      const language = fence[1] ?? ''
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      const source = body.join('\n')
      if (language === 'chart') {
        const chart = parseChart(source)
        // a malformed chart falls back to a code block rather than vanishing
        blocks.push(chart ? { type: 'chart', chart } : { type: 'code', language, text: source })
      } else {
        blocks.push({ type: 'code', language, text: source })
      }
      continue
    }

    // a table needs a header row and the |---| divider directly under it
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      flushParagraph()
      const head = splitRow(line).map(parseInline)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i]) && !TABLE_DIVIDER.test(lines[i])) {
        rows.push(splitRow(lines[i]).map(parseInline))
        i++
      }
      i--
      blocks.push({ type: 'table', head, rows })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        content: parseInline(heading[2]),
      })
      continue
    }

    const bullet = line.match(BULLET)
    if (bullet) {
      flushParagraph()
      const items: Inline[][] = [parseInline(bullet[1])]
      while (i + 1 < lines.length) {
        const next = lines[i + 1].match(BULLET)
        if (!next) break
        items.push(parseInline(next[1]))
        i++
      }
      blocks.push({ type: 'bullets', items })
      continue
    }

    const numbered = line.match(NUMBER)
    if (numbered) {
      flushParagraph()
      const items: Inline[][] = [parseInline(numbered[1])]
      while (i + 1 < lines.length) {
        const next = lines[i + 1].match(NUMBER)
        if (!next) break
        items.push(parseInline(next[1]))
        i++
      }
      blocks.push({ type: 'numbers', items })
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    paragraph.push(line.trim())
  }

  flushParagraph()
  return blocks
}

// read aloud should hear the words, not the punctuation that formats them
export function toSpokenText(text: string): string {
  return parseBlocks(text)
    .map((block) => {
      switch (block.type) {
        case 'code':
          return ''
        case 'chart':
          return [
            block.chart.title,
            ...block.chart.points.map((p) => `${p.label}, ${p.value}${block.chart.unit ? ' ' + block.chart.unit : ''}`),
          ]
            .filter((part) => part !== '')
            .join('. ')
        case 'table':
          return [block.head, ...block.rows]
            .map((row) => row.map(inlineToText).join(', '))
            .join('. ')
        case 'bullets':
        case 'numbers':
          return block.items.map(inlineToText).join('. ')
        default:
          return inlineToText(block.content)
      }
    })
    .filter((part) => part.trim() !== '')
    .join('. ')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function inlineToText(content: Inline[]): string {
  return content.map((part) => part.text).join('')
}

// the answer as plain text to paste somewhere else. unlike toSpokenText this keeps the
// line breaks and the [1] markers, because a pasted answer is read, not heard.
export function toCopyText(text: string): string {
  return parseBlocks(text)
    .map((block) => {
      switch (block.type) {
        case 'code':
          return '```' + block.language + '\n' + block.text + '\n```'
        case 'chart':
          return [
            block.chart.title,
            ...block.chart.points.map(
              (p) => `- ${p.label}: ${p.value}${block.chart.unit ? ' ' + block.chart.unit : ''}`
            ),
          ]
            .filter((line) => line !== '')
            .join('\n')
        case 'table':
          return [block.head, ...block.rows]
            .map((row) => row.map(inlineToText).join(' | '))
            .join('\n')
        case 'bullets':
          return block.items.map((item) => `- ${inlineToText(item)}`).join('\n')
        case 'numbers':
          return block.items.map((item, i) => `${i + 1}. ${inlineToText(item)}`).join('\n')
        default:
          return inlineToText(block.content)
      }
    })
    .filter((part) => part.trim() !== '')
    .join('\n\n')
}
