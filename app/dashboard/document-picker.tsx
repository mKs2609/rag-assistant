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
    <div className="absolute inset-0 bg-carbon/95 backdrop-blur-sm z-20 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-md w-full space-y-5 bg-inkwell rounded-xl p-6 sm:p-8 shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px]"> 
        <h2 className="font-display text-2xl text-bone text-center">Start a new chat</h2>
        <p className="text-sm text-pewter text-center">
          Pick specific documents to focus this chat on, or leave none selected to search everything.
        </p>

        <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg bg-carbon p-2">
          {readyDocs.length === 0 && (
            <p className="text-sm text-pewter p-2">No ready documents yet.</p>
          )}
          {readyDocs.map((doc) => (
            <label
              key={doc.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bone/10 cursor-pointer text-sm text-bone"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(doc.id)}
                onChange={() => onToggle(doc.id)}
                className="accent-[#c99a5b]"
              />
              <span className="truncate">{doc.filename}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate text-bone rounded px-4 py-2 text-sm hover:bg-bone/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            className="flex-1 border border-[#c99a5b] text-[#c99a5b] rounded px-4 py-2 text-sm hover:bg-[#c99a5b]/10 transition-colors"
          >
            {selectedIds.length > 0 ? `Start with ${selectedIds.length} selected` : 'Start with all documents'}
          </button>
        </div>
      </div>
    </div>
  )
}