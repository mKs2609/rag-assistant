'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Strands from '@/components/Strands'
import ElectricBorder from '@/components/ElectricBorder'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    router.push('/dashboard')
    router.refresh()
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

      <div className="hidden lg:block absolute left-16 top-1/2 -translate-y-1/2 max-w-sm z-10 pointer-events-none animate-hero-in">
        <p className="font-display font-light text-5xl leading-[0.95] text-[#fffdf9]">
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
          <h1 className="text-xl font-medium font-display text-bone">Log in</h1>
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
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c99a5b] text-obsidian rounded px-3 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <p className="text-sm text-center text-fog">
            Don&apos;t have an account?{' '}
            <a href="/signup" className="text-[#c99a5b] underline">
              Sign up
            </a>
          </p>
        </div>
      </ElectricBorder>
    </div>
  )
}