import { describe, it, expect } from 'vitest'
import {
  parseBlocks,
  parseInline,
  inlineToText,
  toSpokenText,
  toCopyText,
  type Block,
} from '@/lib/markdown'

function textOf(block: Block): string {
  if (block.type === 'paragraph' || block.type === 'heading') return inlineToText(block.content)
  if (block.type === 'code') return block.text
  return ''
}

describe('parseInline', () => {
  it('reads bold, italic and inline code', () => {
    const parts = parseInline('a **bold** and *slanted* and `code` word')
    expect(parts.map((p) => p.type)).toEqual([
      'text', 'bold', 'text', 'italic', 'text', 'code', 'text',
    ])
    expect(parts[1].text).toBe('bold')
    expect(parts[3].text).toBe('slanted')
    expect(parts[5].text).toBe('code')
  })

  it('leaves asterisks inside a code span alone', () => {
    const parts = parseInline('use `a ** b` here')
    expect(parts.filter((p) => p.type === 'bold')).toHaveLength(0)
    expect(parts[1]).toEqual({ type: 'code', text: 'a ** b' })
  })

  it('treats underscores as italic', () => {
    expect(parseInline('_quiet_')[0]).toEqual({ type: 'italic', text: 'quiet' })
  })

  it('keeps a citation marker as plain text', () => {
    expect(inlineToText(parseInline('the code is 9977287 [1].'))).toBe('the code is 9977287 [1].')
  })

  it('returns an empty run rather than nothing for empty input', () => {
    expect(parseInline('')).toEqual([{ type: 'text', text: '' }])
  })
})

describe('parseBlocks', () => {
  it('joins wrapped lines into one paragraph', () => {
    const blocks = parseBlocks('one line\nand its continuation')
    expect(blocks).toHaveLength(1)
    expect(textOf(blocks[0])).toBe('one line and its continuation')
  })

  it('splits paragraphs on a blank line', () => {
    const blocks = parseBlocks('first\n\nsecond')
    expect(blocks.map(textOf)).toEqual(['first', 'second'])
  })

  it('reads headings and their level', () => {
    const blocks = parseBlocks('## Results\nbody text')
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 })
    expect(textOf(blocks[0])).toBe('Results')
    expect(blocks[1].type).toBe('paragraph')
  })

  it('groups consecutive bullets into one list', () => {
    const blocks = parseBlocks('* one\n* two\n* three')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('bullets')
    if (blocks[0].type === 'bullets') {
      expect(blocks[0].items.map(inlineToText)).toEqual(['one', 'two', 'three'])
    }
  })

  it('accepts a dash as a bullet marker', () => {
    const blocks = parseBlocks('- only item')
    expect(blocks[0].type).toBe('bullets')
  })

  it('groups numbered items and keeps them separate from bullets', () => {
    const blocks = parseBlocks('1. first\n2. second\n\n* a bullet')
    expect(blocks.map((b) => b.type)).toEqual(['numbers', 'bullets'])
    if (blocks[0].type === 'numbers') {
      expect(blocks[0].items.map(inlineToText)).toEqual(['first', 'second'])
    }
  })

  it('reads a table with its header row', () => {
    const blocks = parseBlocks('| Course | ID |\n|---|---|\n| Agent | 9977287 |\n| RAG | 4412903 |')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
    if (blocks[0].type === 'table') {
      expect(blocks[0].head.map(inlineToText)).toEqual(['Course', 'ID'])
      expect(blocks[0].rows).toHaveLength(2)
      expect(blocks[0].rows[1].map(inlineToText)).toEqual(['RAG', '4412903'])
    }
  })

  it('accepts an alignment divider', () => {
    const blocks = parseBlocks('| a | b |\n|:--|--:|\n| 1 | 2 |')
    expect(blocks[0].type).toBe('table')
  })

  it('does not treat a lone pipe line as a table', () => {
    const blocks = parseBlocks('| not a table |\nplain text')
    expect(blocks.every((b) => b.type !== 'table')).toBe(true)
  })

  it('keeps a fenced code block whole, including its blank lines', () => {
    const blocks = parseBlocks('before\n```sql\nselect 1\n\nselect 2\n```\nafter')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph'])
    if (blocks[1].type === 'code') {
      expect(blocks[1].language).toBe('sql')
      expect(blocks[1].text).toBe('select 1\n\nselect 2')
    }
  })

  it('does not format markdown inside a code block', () => {
    const blocks = parseBlocks('```\n* not a bullet\n**not bold**\n```')
    expect(blocks).toHaveLength(1)
    expect(textOf(blocks[0])).toBe('* not a bullet\n**not bold**')
  })

  it('returns nothing for empty input', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('   \n  \n')).toEqual([])
  })

  it('handles an answer that mixes prose, a list and a table', () => {
    const blocks = parseBlocks(
      'Here is what I found:\n\n* two courses\n* both passed\n\n| Course | ID |\n|---|---|\n| Agent | 9977287 |'
    )
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'bullets', 'table'])
  })
})

describe('toSpokenText', () => {
  it('drops the characters that only exist to format the text', () => {
    expect(toSpokenText('**Bold** and *slanted*')).toBe('Bold and slanted')
  })

  it('drops citation markers', () => {
    expect(toSpokenText('The code is 9977287 [1].')).toBe('The code is 9977287 .')
  })

  it('skips code blocks, which do not read aloud usefully', () => {
    expect(toSpokenText('Try this\n```\nselect 1\n```')).toBe('Try this')
  })

  it('reads a table row by row', () => {
    expect(toSpokenText('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a, b. 1, 2')
  })

  it('separates bullets so they do not run together', () => {
    expect(toSpokenText('* one\n* two')).toBe('one. two')
  })
})

describe('toCopyText', () => {
  it('keeps the citation markers, because they are the point of the answer', () => {
    expect(toCopyText('The code is 9977388 [1].')).toBe('The code is 9977388 [1].')
  })

  it('keeps bullets on their own lines rather than running them into a sentence', () => {
    expect(toCopyText('* one\n* two')).toBe('- one\n- two')
  })

  it('numbers an ordered list from one, whatever the source numbering', () => {
    expect(toCopyText('3. first\n7. second')).toBe('1. first\n2. second')
  })

  it('separates blocks with a blank line', () => {
    expect(toCopyText('## Heading\n\nA sentence.')).toBe('Heading\n\nA sentence.')
  })

  it('keeps a code block fenced, so pasted code stays code', () => {
    expect(toCopyText('```sql\nselect 1\n```')).toBe('```sql\nselect 1\n```')
  })

  it('writes a chart out as readable lines, since the drawing cannot be pasted', () => {
    const chart = [
      '```chart',
      JSON.stringify({
        kind: 'bar',
        title: 'Team size',
        unit: 'people',
        points: [
          { label: 'Engineering', value: 12 },
          { label: 'Design', value: 4 },
        ],
      }),
      '```',
    ].join('\n')
    expect(toCopyText(chart)).toBe('Team size\n- Engineering: 12 people\n- Design: 4 people')
  })

  it('lays a table out row by row', () => {
    const table = '| Name | Count |\n|---|---|\n| Design | 4 |'
    expect(toCopyText(table)).toBe('Name | Count\nDesign | 4')
  })

  it('drops the markdown markers from bold and italic text', () => {
    expect(toCopyText('A **bold** word.')).toBe('A bold word.')
  })
})
