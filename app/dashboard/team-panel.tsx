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
}: {
  currentUserId: string
  currentUserRole: string
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const canManageInvites = currentUserRole === 'owner' || currentUserRole === 'admin'
  const canRemoveMembers = currentUserRole === 'owner'

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
      <div>
        <h2 className="font-display text-2xl text-bone mb-1">Team</h2>
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
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between bg-inkwell rounded-lg px-3 py-2 text-sm gap-2">
                  <div className="min-w-0">
                    <p className="text-bone truncate">{friendlyName(m)}</p>
                    <p className="text-xs text-bone/60 truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-bone/70 uppercase tracking-wide">{m.role}</span>
                    {canRemoveMembers && m.id !== currentUserId && m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        disabled={removingId === m.id}
                        className="text-red-400 hover:underline text-xs disabled:opacity-40"
                      >
                        {removingId === m.id ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-bone/50">
              Names are derived from email addresses — a proper display name setting may come later.
            </p>
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