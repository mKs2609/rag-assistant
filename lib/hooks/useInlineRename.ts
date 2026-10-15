'use client'

import { useState } from 'react'

// renaming the workspace and renaming yourself were written out twice, three pieces of
// state and a near identical save each time, so a fix to one would not have reached the
// other. the decision of whether a draft is worth saving is kept separate and tested.

/** a blank name is not a rename, and neither is the name it already had */
export function worthSaving(draft: string, current: string): boolean {
  const trimmed = draft.trim()
  return trimmed !== '' && trimmed !== current.trim()
}

export interface InlineRename {
  editing: boolean
  draft: string
  saving: boolean
  setDraft: (value: string) => void
  start: (current: string) => void
  cancel: () => void
  commit: (current: string) => Promise<void>
}

export function useInlineRename(
  save: (name: string) => Promise<string | null>,
  onSaved: (name: string) => void
): InlineRename {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  return {
    editing,
    draft,
    saving,
    setDraft,
    start: (current: string) => {
      setDraft(current)
      setEditing(true)
    },
    cancel: () => setEditing(false),
    commit: async (current: string) => {
      if (!worthSaving(draft, current)) {
        setEditing(false)
        return
      }
      setSaving(true)
      const saved = await save(draft.trim())
      setSaving(false)
      // a failed save keeps the box open with the draft intact, so the typing is not lost
      if (saved === null) return
      onSaved(saved)
      setEditing(false)
    },
  }
}
