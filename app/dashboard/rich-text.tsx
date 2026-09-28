import { parseBlocks, type Block, type Inline } from '@/lib/markdown'
import AnswerChart from './answer-chart'

function InlineRun({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'bold') return <strong key={i} className="font-semibold">{part.text}</strong>
        if (part.type === 'italic') return <em key={i} className="italic">{part.text}</em>
        if (part.type === 'code') {
          return (
            <code key={i} className="font-mono text-[0.9em] bg-obsidian/60 px-1 py-0.5 rounded">
              {part.text}
            </code>
          )
        }
        return <span key={i}>{part.text}</span>
      })}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const size = block.level <= 2 ? 'text-base' : 'text-sm'
      return (
        <p className={`font-display ${size} text-bone mt-3 first:mt-0`}>
          <InlineRun parts={block.content} />
        </p>
      )
    }

    case 'bullets':
      return (
        <ul className="list-disc pl-5 space-y-1 my-2 marker:text-accent">
          {block.items.map((item, i) => (
            <li key={i}><InlineRun parts={item} /></li>
          ))}
        </ul>
      )

    case 'numbers':
      return (
        <ol className="list-decimal pl-5 space-y-1 my-2 marker:text-accent">
          {block.items.map((item, i) => (
            <li key={i}><InlineRun parts={item} /></li>
          ))}
        </ol>
      )

    case 'table':
      return (
        <div className="my-3 overflow-x-auto thin-scroll">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    className="text-left font-semibold text-bone border-b border-slate px-3 py-2 whitespace-nowrap"
                  >
                    <InlineRun parts={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-ash/60 last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      <InlineRun parts={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'chart':
      // already checked on the server against the full passages, this just draws the verdict
      return <AnswerChart chart={block.chart} />

    case 'code':
      return (
        <pre className="my-3 bg-obsidian/70 rounded-lg p-3 overflow-x-auto thin-scroll">
          <code className="font-mono text-xs text-bone whitespace-pre">{block.text}</code>
        </pre>
      )

    default:
      return (
        <p className="my-2 first:mt-0 last:mb-0">
          <InlineRun parts={block.content} />
        </p>
      )
  }
}

export default function RichText({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  // while an answer is still streaming the first block may be a bare word, which is fine
  if (blocks.length === 0) return null
  return (
    <div className="leading-relaxed">
      {blocks.map((block, i) => <BlockView key={i} block={block} />)}
    </div>
  )
}
