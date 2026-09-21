'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AuthShell from '@/components/AuthShell'

type LinkState = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  const [linkState, setLinkState] = useState<LinkState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // the reset link carries a short-lived session in the url hash
  useEffect(() => {
    async function startSession() {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      // don't leave tokens in the address bar or browser history
      window.history.replaceState(null, '', window.location.pathname)

      if (params.get('type') !== 'recovery' || !accessToken || !refreshToken) {
        setLinkState('invalid')
        return
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      setLinkState(error ? 'invalid' : 'ready')
    }
    startSession()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError("The passwords don't match.")
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setSaving(false)
      setError(error.message)
      return
    }

    // in case the old password was compromised, end sessions on other devices
    await supabase.auth.signOut({ scope: 'others' })

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-medium font-display text-bone">Set a new password</h1>

      {linkState === 'checking' && <p className="text-sm text-fog">Checking your link…</p>}

      {linkState === 'invalid' && (
        <>
          <p className="text-sm text-red-400">
            This reset link is invalid or has expired. Links can only be used once.
          </p>
          <a href="/forgot-password" className="text-sm text-[#c99a5b] underline block">
            Send a new link
          </a>
        </>
      )}

      {linkState === 'ready' && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-ash rounded px-3 py-2 pr-16 bg-obsidian/60 text-bone placeholder:text-fog"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fog"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-ash rounded px-3 py-2 bg-obsidian/60 text-bone placeholder:text-fog"
            autoComplete="new-password"
            minLength={6}
            required
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#c99a5b] text-obsidian rounded px-3 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
