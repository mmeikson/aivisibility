'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/db/client'
import Link from 'next/link'

export default function AuthPage() {
  return <Suspense><AuthForm /></Suspense>
}

function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const saveId = searchParams.get('save')
  const hasError = searchParams.get('error') === '1'

  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(hasError ? 'Authentication failed. Please try again.' : '')
  const [success, setSuccess] = useState('')

  const supabase = getSupabaseClient()

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}${saveId ? `&save=${saveId}` : ''}` },
        })
        if (error) throw error
        setSuccess('Check your email for a confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // After login, save if needed then navigate
        if (saveId) {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('reports').update({ user_id: user.id }).eq('id', saveId).is('user_id', null)
          }
          router.push(`/report/${saveId}?saved=1`)
        } else {
          router.push(next)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    const callbackUrl = `${window.location.origin}/auth/callback?next=${next}${saveId ? `&save=${saveId}` : ''}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
        <Link href="/" className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase hover:text-[#141414] transition-colors">
          GEO Visibility
        </Link>
        <span className="text-xs text-[#6C6C6C]">Beta</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8 fade-up">

          <div className="space-y-2">
            <h1
              className="text-3xl text-[#141414] tracking-tight"
              style={{ fontFamily: 'var(--font-fraunces)', fontVariationSettings: "'opsz' 72, 'wght' 600" }}
            >
              {mode === 'signup' ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-[#6C6C6C]">
              {saveId
                ? 'Create an account to save and share your results.'
                : mode === 'signup'
                ? 'Save your analyses and track your AI visibility over time.'
                : 'Sign in to access your dashboard.'}
            </p>
          </div>

          {success ? (
            <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#16a34a]">
              {success}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Google */}
              <button
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-[#E5E2DC] rounded-lg text-sm text-[#141414] hover:border-[#141414]/30 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <span className="flex-1 h-px bg-[#E5E2DC]" />
                <span className="text-xs text-[#ABABAB] font-mono">or</span>
                <span className="flex-1 h-px bg-[#E5E2DC]" />
              </div>

              {/* Email/password */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#E5E2DC] rounded-lg text-sm text-[#141414] placeholder:text-[#ABABAB] focus:outline-none focus:ring-2 focus:ring-[#141414]/20 focus:border-[#141414] transition-all"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-white border border-[#E5E2DC] rounded-lg text-sm text-[#141414] placeholder:text-[#ABABAB] focus:outline-none focus:ring-2 focus:ring-[#141414]/20 focus:border-[#141414] transition-all"
                />
                {error && <p className="text-xs text-[#b91c1c]">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-[#141414] text-[#FAFAF8] text-sm font-medium rounded-lg hover:bg-[#2a2a2a] disabled:opacity-40 transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-[#FAFAF8]/30 border-t-[#FAFAF8] rounded-full animate-spin" />
                      {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                    </span>
                  ) : mode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>

              <p className="text-center text-xs text-[#6C6C6C]">
                {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }}
                  className="text-[#141414] underline underline-offset-2"
                >
                  {mode === 'signup' ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
