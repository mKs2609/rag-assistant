'use client'

import { useState } from 'react'
import AuthShell from '@/components/AuthShell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null)

    setLoading(false)

    if (!res) {
      setError("Couldn't reach the server. Check your connection and try again.")
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong')
      return
    }

    setSentTo(email)
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-medium font-display text-bone">Reset your password</h1>

      {sentTo ? (
        <p className="text-sm text-bone" role="status">
          If an account exists for <span className="text-[#c99a5b]">{sentTo}</span>, we&apos;ve sent a link
          to reset the password. It can take a minute to arrive, so check spam too.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-fog">Enter your email and we&apos;ll send you a link to set a new password.</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ash rounded px-3 py-2 bg-obsidian/60 text-bone placeholder:text-fog"
            required
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#c99a5b] text-obsidian rounded px-3 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-sm text-center text-fog">
        <a href="/login" className="text-[#c99a5b] underline">
          Back to log in
        </a>
      </p>
    </AuthShell>
  )
}
