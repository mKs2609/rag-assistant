'use client'

import { useEffect, useRef, useState } from 'react'

interface Document {
  id: string
  filename: string
  status: string
}

export default function AttachMenu({
  documents,
  currentlyScopedIds,
  onUploadNew,
  onAttachExisting,
  disabled = false,
}: {
  documents: Document[]
  currentlyScopedIds: string[]
  onUploadNew: (file: File) => void
  onAttachExisting: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showExisting, setShowExisting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-attach-menu]')) {
        setOpen(false)
        setShowExisting(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const availableDocs = documents.filter(
    (d) => d.status === 'ready' && !currentlyScopedIds.includes(d.id)
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onUploadNew(file)
    }
    setOpen(false)
    setShowExisting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="relative shrink-0" data-attach-menu>
      <button
        type="button"
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
          setShowExisting(false)
        }}
        disabled={disabled}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-slate text-bone hover:bg-bone/10 disabled:opacity-40 transition-colors"
        aria-label="Attach a document"
      >
        +
      </button>

      {open && !showExisting && (
        <div className="absolute bottom-full mb-2 left-0 w-52 bg-inkwell border border-ash rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] py-1 z-30">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-left px-3 py-2 text-sm text-bone hover:bg-bone/10"
          >
            Upload new
          </button>
          <button
            type="button"
            onClick={() => setShowExisting(true)}
            className="w-full text-left px-3 py-2 text-sm text-bone hover:bg-bone/10"
          >
            Attach existing document
          </button>
        </div>
      )}

      {open && showExisting && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-inkwell border border-ash rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] py-1 z-30 max-h-56 overflow-y-auto">
          {availableDocs.length === 0 ? (
            <p className="px-3 py-2 text-sm text-pewter">No other documents available.</p>
          ) : (
            availableDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => {
                  onAttachExisting(doc.id)
                  setOpen(false)
                  setShowExisting(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-bone hover:bg-bone/10 truncate block"
              >
                {doc.filename}
              </button>
            ))
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
    </div>
  )
}