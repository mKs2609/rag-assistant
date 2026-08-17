'use client'

import { useEffect, useState } from 'react'

interface Member {
  id: string
  email: string
  role: string
  display_name: string | null
  created_at: string
}

interface Invite {
  id: string
  token: string
  role: string
  used_at: string | null
  expires_at: string
  created_at: string
}

function friendlyName(member: { display_name: string | null; email: string }): string {
  if (member.display_name) return member.display_name
  const localPart = member.email.split('@')[0] ?? member.email
  return localPart.split('+')[0] ?? localPart
}

export default function TeamPanel({
  currentUserId,
  currentUserRole,
  workspaceName,
  onRenameWorkspace,
}: {
  currentUserId: string
  currentUserRole: string
  workspaceName: string
  onRenameWorkspace: (name: string) => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // A single open-menu id covers every row-level "⋯" menu on this page —
  // the workspace title uses the id 'workspace', each member row uses its
  // own member id. Only one can ever be open at a time.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const [editingWorkspaceName, setEditingWorkspaceName] = useState(false)
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(workspaceName)
  const [savingWorkspaceName, setSavingWorkspaceName] = useState(false)

  const [editingOwnName, setEditingOwnName] = useState(false)
  const [ownNameDraft, setOwnNameDraft] = useState('')
  const [savingOwnName, setSavingOwnName] = useState(false)

  const canManageInvites = currentUserRole === 'owner' || currentUserRole === 'admin'
  const canRemoveMembers = currentUserRole === 'owner'
  const canRenameWorkspace = currentUserRole === 'owner'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-team-menu]')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadAll() {
    setLoading(true)
    setError('')

    const memberRes = await fetch('/api/team')
    if (memberRes.ok) {
      const data = await memberRes.json()
      setMembers(data.members ?? [])
    } else {
      const data = await memberRes.json().catch(() => ({}))
      setError(data.error ?? `Could not load team members (status ${memberRes.status}).`)
    }

    if (canManageInvites) {
      const inviteRes = await fetch('/api/invites')
      if (inviteRes.ok) {
        const data = await inviteRes.json()
        setInvites(data.invites ?? [])
      } else {
        const data = await inviteRes.json().catch(() => ({}))
        setError((prev) => prev || data.error || `Could not load invites (status ${inviteRes.status}).`)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveWorkspaceName() {
    const trimmed = workspaceNameDraft.trim()
    if (!trimmed || trimmed === workspaceName) {
      setEditingWorkspaceName(false)
      setWorkspaceNameDraft(workspaceName)
      return
    }

    setSavingWorkspaceName(true)
    const res = await fetch('/api/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setSavingWorkspaceName(false)

    if (res.ok) {
      const data = await res.json()
      onRenameWorkspace(data.name)
      setEditingWorkspaceName(false)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to rename workspace')
    }
  }

  function startEditingOwnName(currentName: string) {
    setOpenMenuId(null)
    setOwnNameDraft(currentName)
    setEditingOwnName(true)
  }

  async function handleSaveOwnName() {
    const trimmed = ownNameDraft.trim()
    if (!trimmed) {
      setEditingOwnName(false)
      return
    }

    setSavingOwnName(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: trimmed }),
    })
    setSavingOwnName(false)

    if (res.ok) {
      const data = await res.json()
      setMembers((prev) =>
        prev.map((m) => (m.id === currentUserId ? { ...m, display_name: data.displayName } : m))
      )
      setEditingOwnName(false)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to update your name')
    }
  }

  async function handleGenerateInvite() {
    setGenerating(true)
    setError('')

    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member' }),
    })

    setGenerating(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to create invite')
      return
    }

    loadAll()
  }

  async function handleRevokeInvite(id: string) {
    setRevokingId(id)
    const res = await fetch(`/api/invites/${id}`, { method: 'DELETE' })
    setRevokingId(null)

    if (res.ok) {
      setInvites((prev) => prev.filter((inv) => inv.id !== id))
    }
  }

  async function handleRemoveMember(id: string) {
    setOpenMenuId(null)
    setRemovingId(id)
    setError('')

    const res = await fetch(`/api/team/${id}`, { method: 'DELETE' })
    setRemovingId(null)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to remove member')
      return
    }

    setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const pendingInvites = invites.filter((inv) => !inv.used_at && new Date(inv.expires_at) > new Date())

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8">
      <div className="space-y-1">
        {editingWorkspaceName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={workspaceNameDraft}
              onChange={(e) => setWorkspaceNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveWorkspaceName()
                if (e.key === 'Escape') {
                  setEditingWorkspaceName(false)
                  setWorkspaceNameDraft(workspaceName)
                }
              }}
              className="font-display text-2xl text-bone bg-inkwell border border-slate rounded px-2 py-1 outline-none"
            />
            <button
              onClick={handleSaveWorkspaceName}
              disabled={savingWorkspaceName}
              className="text-[#c99a5b] text-sm hover:underline disabled:opacity-40"
            >
              {savingWorkspaceName ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditingWorkspaceName(false)
                setWorkspaceNameDraft(workspaceName)
              }}
              className="text-bone/70 text-sm hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="relative flex items-center gap-1" data-team-menu>
            <h2 className="font-display text-2xl text-bone">{workspaceName}</h2>
            {canRenameWorkspace && (
              <>
                <button
                  onClick={() => setOpenMenuId(openMenuId === 'workspace' ? null : 'workspace')}
                  className="text-bone hover:text-[#c99a5b] px-1"
                  aria-label="Workspace options"
                >
                  ⋯
                </button>
                {openMenuId === 'workspace' && (
                  <div className="absolute left-0 top-full mt-1 z-30 w-44 bg-inkwell border border-slate rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] py-1">
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        setWorkspaceNameDraft(workspaceName)
                        setEditingWorkspaceName(true)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-bone hover:bg-bone/10"
                    >
                      Rename workspace
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <p className="text-sm text-bone/70">Everyone with access to this workspace.</p>
      </div>

      {loading ? (
        <p className="text-sm text-bone/70">Loading…</p>
      ) : (
        <>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="space-y-2">
            <p className="text-xs font-bold text-bone uppercase tracking-wider">
              Members ({members.length})
            </p>
            <ul className="space-y-1">
              {members.map((m) => {
                const isMe = m.id === currentUserId
                const isEditingThisName = isMe && editingOwnName
                const hasAnyMenuAction = isMe || (canRemoveMembers && !isMe && m.role !== 'owner')

                return (
                  <li
                    key={m.id}
                    data-team-menu
                    className="relative flex items-center justify-between bg-inkwell rounded-lg px-3 py-2 text-sm gap-2"
                  >
                    {isEditingThisName ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          autoFocus
                          value={ownNameDraft}
                          onChange={(e) => setOwnNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveOwnName()
                            if (e.key === 'Escape') setEditingOwnName(false)
                          }}
                          className="flex-1 min-w-0 bg-obsidian border border-slate rounded px-2 py-1 text-bone outline-none"
                        />
                        <button
                          onClick={handleSaveOwnName}
                          disabled={savingOwnName}
                          className="text-[#c99a5b] text-xs hover:underline disabled:opacity-40 shrink-0"
                        >
                          {savingOwnName ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingOwnName(false)}
                          className="text-bone/70 text-xs hover:underline shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="text-bone truncate">
                            {friendlyName(m)}
                            {isMe && <span className="text-bone/50"> (you)</span>}
                          </p>
                          <p className="text-xs text-bone/60 truncate">{m.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-bone/70 uppercase tracking-wide">{m.role}</span>
                          {hasAnyMenuAction && (
                            <button
                              onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                              className="text-bone hover:text-[#c99a5b] px-1"
                              aria-label="Member options"
                            >
                              ⋯
                            </button>
                          )}
                        </div>
                        {openMenuId === m.id && (
                          <div className="absolute right-0 top-full mt-1 z-30 w-40 bg-inkwell border border-slate rounded-lg shadow-[rgba(4,4,7,0.25)_0px_2px_4px_0px,rgba(4,4,7,0.4)_0px_8px_24px_0px] py-1">
                            {isMe && (
                              <button
                                onClick={() => startEditingOwnName(m.display_name ?? friendlyName(m))}
                                className="w-full text-left px-3 py-2 text-sm text-[#c99a5b] hover:bg-bone/10"
                              >
                                Edit name
                              </button>
                            )}
                            {canRemoveMembers && !isMe && m.role !== 'owner' && (
                              <button
                                onClick={() => handleRemoveMember(m.id)}
                                disabled={removingId === m.id}
                                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-bone/10 disabled:opacity-40"
                              >
                                {removingId === m.id ? 'Removing…' : 'Remove'}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {canManageInvites && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-bone uppercase tracking-wider">
                  Pending invites ({pendingInvites.length})
                </p>
                <button
                  onClick={handleGenerateInvite}
                  disabled={generating}
                  className="border border-[#c99a5b] text-[#c99a5b] rounded px-4 py-1.5 text-xs disabled:opacity-40 hover:bg-[#c99a5b]/10 transition-colors"
                >
                  {generating ? 'Generating…' : '+ Generate invite link'}
                </button>
              </div>

              {pendingInvites.length === 0 ? (
                <p className="text-sm text-bone/70">
                  No pending invites. Generate a link above and share it with someone to add them to this workspace.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pendingInvites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2 bg-inkwell rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-bone truncate">Invite link · {inv.role}</p>
                        <p className="text-xs text-bone/60">
                          Expires {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => copyInviteLink(inv.token)}
                          className="text-[#c99a5b] hover:underline text-xs"
                        >
                          {copiedToken === inv.token ? 'Copied!' : 'Copy link'}
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          disabled={revokingId === inv.id}
                          className="text-red-400 hover:underline text-xs disabled:opacity-40"
                        >
                          {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-bone/50">
                Each link works once and expires after 7 days. Share it directly with the person you&apos;re inviting — anyone who has the link can use it, so treat it like a password.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}