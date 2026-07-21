'use client'

interface Document {
  id: string
  filename: string
  status: string
}

export default function DocumentPicker({
  documents,
  selectedIds,
  onToggle,
  onStart,
  onCancel,
}: {
  documents: Document[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onStart: () => void
  onCancel: () => void
}) {
  const readyDocs = documents.filter((d) => d.status === 'ready')

  return (
    <div className="absolute inset-0 bg-bg/95 z-10 flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-4">
        <h2 className="font-display text-xl">Start a new chat</h2>
        <p className="text-sm text-text-muted">
          Pick specific documents to focus this chat on, or leave none selected to search everything.
        </p>

        <div className="space-y-1 max-h-64 overflow-y-auto border border-border rounded-xl p-2">
          {readyDocs.length === 0 && (
            <p className="text-sm text-text-muted p-2">No ready documents yet.</p>
          )}
          {readyDocs.map((doc) => (
            <label
              key={doc.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-muted cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(doc.id)}
                onChange={() => onToggle(doc.id)}
                className="accent-signal"
              />
              <span className="truncate">{doc.filename}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-border rounded-full px-4 py-2 text-sm hover:bg-surface-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            className="flex-1 bg-text text-surface rounded-full px-4 py-2 text-sm hover:opacity-90 transition-opacity"
          >
            {selectedIds.length > 0 ? `Start with ${selectedIds.length} selected` : 'Start with all documents'}
          </button>
        </div>
      </div>
    </div>
  )
}