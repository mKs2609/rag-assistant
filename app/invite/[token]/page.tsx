'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Strands from '@/components/Strands'
import ElectricBorder from '@/components/ElectricBorder'

export default function InvitePage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()

  const [checking, setChecking] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  const [invalidReason, setInvalidReason] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [likelyExistingAccount, setLikelyExistingAccount] = useState(false)

  useEffect(() => {
    async function checkInvite() {
      const res = await fetch(`/api/invites/${token}`)
      const data = await res.json()
      if (!res.ok) {
        setInvalidReason(data.error ?? 'This invite link is invalid.')
      } else {
        setWorkspaceName(data.workspaceName)
      }
      setChecking(false)
    }
    checkInvite()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setLikelyExistingAccount(false)

    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, inviteToken: token }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      if (data.error?.toLowerCase().includes('already have an account')) {
        setLikelyExistingAccount(true)
      }
      return
    }

    router.push('/login')
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#101010]">
      <div className="absolute inset-0 pointer-events-none">
        <Strands
          colors={['#ff2a2a', '#2a7fff', '#2aff2a']}
          count={3}
          speed={0.15}
          amplitude={0.6}
          thickness={0.5}
          glow={2}
          intensity={0.4}
          saturation={1.1}
          scale={1}
          glass={true}
          refraction={1.2}
          dispersion={1.4}
          glassSize={0.45}
        />
      </div>

      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full px-6 text-center z-10 pointer-events-none animate-hero-in lg:top-1/2 lg:-translate-y-1/2 lg:left-16 lg:translate-x-0 lg:w-auto lg:max-w-sm lg:text-left">
        <p className="font-display font-light text-3xl sm:text-4xl lg:text-5xl leading-[0.95] text-[#fffdf9]">
          Ask <span className="italic text-[#847dff]">anything</span>
          <br />about your documents
        </p>
      </div>

      <ElectricBorder
        color="#c99a5b"
        speed={0.6}
        chaos={0.08}
        borderRadius={16}
        style={{ width: '100%', maxWidth: '24rem' }}
        className="relative z-10 mx-4"
      >
        <div className="space-y-4 bg-obsidian/85 backdrop-blur-sm border border-ash rounded-2xl p-8">
          {checking ? (
            <p className="text-bone text-sm">Checking invite…</p>
          ) : invalidReason ? (
            <>
              <h1 className="text-xl font-medium font-display text-bone">Invite unavailable</h1>
              <p className="text-bone/70 text-sm">{invalidReason}</p>
              <a href="/signup" className="text-[#c99a5b] underline text-sm block">
                Create your own workspace instead
              </a>
              <a href="/login" className="text-[#c99a5b] underline text-sm block">
                Log in
              </a>
            </>
          ) : (
            <>
              <h1 className="text-xl font-medium font-display text-bone">Join {workspaceName}</h1>
              <p className="text-bone/70 text-sm">Create your account to join this workspace.</p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-ash rounded px-3 py-2 bg-obsidian/60 text-bone placeholder:text-fog"
                  required
                />
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-ash rounded px-3 py-2 pr-10 bg-obsidian/60 text-bone placeholder:text-fog"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-fog"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-10-8-10-8a18.5 18.5 0 015.06-5.94M9.9 4.24A10.4 10.4 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {error && (
                  <div className="space-y-1">
                    <p className="text-red-400 text-sm">{error}</p>
                    {likelyExistingAccount && (
                      <a href="/login" className="text-[#c99a5b] underline text-sm block">
                        Log in instead
                      </a>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#c99a5b] text-obsidian rounded px-3 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {loading ? 'Joining…' : 'Join workspace'}
                </button>
              </form>
            </>
          )}
        </div>
      </ElectricBorder>
    </div>
  )
}