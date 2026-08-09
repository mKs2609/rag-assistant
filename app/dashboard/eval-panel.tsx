'use client'

import { useEffect, useRef, useState } from 'react'

interface Document {
  id: string
  filename: string
  status: string
}

interface EvalQuestion {
  id: string
  question: string
  expected_document_id: string | null
  expected_keywords: string[]
  documents: { filename: string } | null
}

interface EvalResult {
  questionId: string
  question: string
  retrievalHit: boolean
  answerCorrect: boolean
  answer: string
  keywordsFound?: string[]
  keywordsExpected?: string[]
  error?: string
}

export default function EvalPanel({ documents }: { documents: Document[] }) {
  const [questions, setQuestions] = useState<EvalQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [newQuestion, setNewQuestion] = useState('')
  const [newDocId, setNewDocId] = useState('')
  const [newKeywords, setNewKeywords] = useState('')
  const [adding, setAdding] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, EvalResult>>({})
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const anyRunning = runningAll || runningId !== null

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-eval-menu]')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadQuestions() {
    setLoadingQuestions(true)
    const res = await fetch('/api/eval/questions')
    if (res.ok) {
      const data = await res.json()
      setQuestions(data.questions ?? [])
    }
    setLoadingQuestions(false)
  }

  useEffect(() => {
    loadQuestions()
  }, [])

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault()
    if (!newQuestion.trim()) return

    setAdding(true)
    setError('')

    const res = await fetch('/api/eval/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: newQuestion,
        expectedDocumentId: newDocId || null,
        // Split on commas AND whitespace, so "march 2026" behaves the
        // same as "march, 2026" — previously, a phrase typed without a
        // comma was treated as one single unmatchable keyword, which
        // silently failed every check that used it.
        expectedKeywords: newKeywords
          .split(',')
          .flatMap((segment) => segment.trim().split(/\s+/))
          .filter(Boolean),
      }),
    })

    setAdding(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to add question')
      return
    }

    setNewQuestion('')
    setNewDocId('')
    setNewKeywords('')
    loadQuestions()
  }

  async function handleDeleteQuestion(id: string) {
    setOpenMenuId(null)
    await fetch(`/api/eval/questions/${id}`, { method: 'DELETE' })
    setResults((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
    loadQuestions()
  }

  async function handleRunAll() {
    setRunningAll(true)
    setError('')

    const res = await fetch('/api/eval/run', { method: 'POST' })
    const data = await res.json()

    setRunningAll(false)

    if (!res.ok) {
      setError(data.error ?? 'Evaluation failed')
      return
    }

    const next: Record<string, EvalResult> = {}
    for (const r of data.results as EvalResult[]) {
      next[r.questionId] = r
    }
    setResults((prev) => ({ ...prev, ...next }))
  }

  async function handleRunOne(questionId: string) {
    setOpenMenuId(null)
    setRunningId(questionId)
    setError('')

    const res = await fetch('/api/eval/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId }),
    })
    const data = await res.json()

    setRunningId(null)

    if (!res.ok) {
      setError(data.error ?? 'Evaluation failed')
      return
    }

    const result: EvalResult | undefined = data.results?.[0]
    if (result) {
      setResults((prev) => ({ ...prev, [questionId]: result }))
    }
  }

  const readyDocs = documents.filter((d) => d.status === 'ready')

  const visibleResults = questions
    .map((q) => results[q.id])
    .filter((r): r is EvalResult => Boolean(r))

  const retrievalScore = visibleResults.length
    ? visibleResults.filter((r) => r.retrievalHit).length / visibleResults.length
    : null
  const answerScore = visibleResults.length
    ? visibleResults.filter((r) => r.answerCorrect).length / visibleResults.length
    : null

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8">
      <div>
        <h2 className="font-display text-2xl text-bone mb-1">Evaluation</h2>
        <p className="text-sm text-pewter">
          Test retrieval and answer quality against known question/answer pairs — not just a manual spot-check.
        </p>
      </div>

      <form onSubmit={handleAddQuestion} className="space-y-3 bg-inkwell rounded-lg p-5 shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px]">
        <p className="text-xs font-bold text-bone uppercase tracking-wider">Add a test question</p>
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="e.g. When was the Build an AI Agent certificate issued?"
          className="w-full border border-slate bg-carbon text-bone placeholder:text-pewter rounded px-3 py-2 text-sm"
        />
        <select
          value={newDocId}
          onChange={(e) => setNewDocId(e.target.value)}
          className="w-full border border-slate bg-carbon text-bone rounded px-3 py-2 text-sm"
        >
          <option value="">Expected document (optional)</option>
          {readyDocs.map((d) => (
            <option key={d.id} value={d.id}>{d.filename}</option>
          ))}
        </select>
        <div>
          <input
            type="text"
            value={newKeywords}
            onChange={(e) => setNewKeywords(e.target.value)}
            placeholder="Expected keywords, e.g. march 2026"
            className="w-full border border-slate bg-carbon text-bone placeholder:text-pewter rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-pewter mt-1">
            Each word is checked individually against the answer — commas are optional.
          </p>
        </div>
        <button
          type="submit"
          disabled={adding || !newQuestion.trim()}
          className="bg-bone text-obsidian rounded px-4 py-2 text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {adding ? 'Adding…' : 'Add question'}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </form>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-bone uppercase tracking-wider">
            Test questions ({questions.length})
          </p>
          <button
            onClick={handleRunAll}
            disabled={anyRunning || questions.length === 0}
            className="border border-[#c99a5b] text-[#c99a5b] rounded px-4 py-1.5 text-xs disabled:opacity-40 hover:bg-[#c99a5b]/10 transition-colors"
          >
            {runningAll ? 'Running all…' : 'Run all'}
          </button>
        </div>

        {loadingQuestions && <p className="text-sm text-pewter">Loading…</p>}
        {!loadingQuestions && questions.length === 0 && (
          <p className="text-sm text-pewter">No test questions yet — add one above to get started.</p>
        )}

        <ul className="space-y-1">
          {questions.map((q) => (
            <li
              key={q.id}
              data-eval-menu
              className="relative flex items-center justify-between gap-2 bg-inkwell rounded-lg px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-bone truncate">{q.question}</p>
                <p className="text-xs text-pewter truncate">
                  {q.documents?.filename ? `Expects: ${q.documents.filename}` : 'No expected document set'}
                  {q.expected_keywords.length > 0 && ` · keywords: ${q.expected_keywords.join(', ')}`}
                </p>
              </div>

              <button
                onClick={() => setOpenMenuId(openMenuId === q.id ? null : q.id)}
                className="shrink-0 text-bone hover:text-[#c99a5b] px-1"
                aria-label="Question options"
              >
                ⋯
              </button>

              {openMenuId === q.id && (
                <div className="absolute right-0 top-full mt-1 z-30 w-32 bg-inkwell border border-slate rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] py-1">
                  <button
                    onClick={() => handleRunOne(q.id)}
                    disabled={anyRunning}
                    className="w-full text-left px-3 py-2 text-sm text-[#c99a5b] hover:bg-bone/10 disabled:opacity-40"
                  >
                    {runningId === q.id ? 'Running…' : 'Run'}
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-bone/10"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {visibleResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <div className="bg-inkwell rounded-lg px-4 py-3 flex-1">
              <p className="text-xs text-pewter uppercase tracking-wide">Retrieval accuracy</p>
              <p className="font-display text-3xl text-bone">
                {retrievalScore !== null ? `${Math.round(retrievalScore * 100)}%` : '—'}
              </p>
            </div>
            <div className="bg-inkwell rounded-lg px-4 py-3 flex-1">
              <p className="text-xs text-pewter uppercase tracking-wide">Answer accuracy</p>
              <p className="font-display text-3xl text-bone">
                {answerScore !== null ? `${Math.round(answerScore * 100)}%` : '—'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {visibleResults.map((r) => (
              <div key={r.questionId} className="bg-inkwell rounded-lg px-3 py-2 text-sm space-y-1">
                <p className="text-bone">{r.question}</p>
                <div className="flex gap-3 text-xs">
                  <span className={r.retrievalHit ? 'text-bone' : 'text-red-400'}>
                    {r.retrievalHit ? '✓ retrieval' : '✗ retrieval'}
                  </span>
                  <span className={r.answerCorrect ? 'text-bone' : 'text-red-400'}>
                    {r.answerCorrect ? '✓ answer' : '✗ answer'}
                  </span>
                </div>
                {r.error ? (
                  <p className="text-xs text-red-400">{r.error}</p>
                ) : (
                  <p className="text-xs text-pewter">{r.answer}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}