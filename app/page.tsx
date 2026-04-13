'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/db/client'

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    getSupabaseClient().auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      setIsLoggedIn(!!data.session)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong')
        return
      }
      const { reportId } = await res.json()
      router.push(`/report/${reportId}/loading`)
    } catch {
      setError('Failed to start analysis. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: "20px", width: "auto" }} />
        </Link>
        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <Link href="/dashboard" className="text-xs font-mono text-[#6C6C6C] hover:text-[#141414] transition-colors">
              Dashboard
            </Link>
          ) : (
            <Link href="/auth" className="text-xs font-mono text-[#6C6C6C] hover:text-[#141414] transition-colors">
              Log in
            </Link>
          )}
          <span className="text-xs text-[#6C6C6C]">Beta</span>
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
        <div className="w-full max-w-2xl space-y-10 fade-up">

          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 text-xs font-mono tracking-widest text-[#6C6C6C] uppercase">
              <span className="w-4 h-px bg-[#6C6C6C]" />
              AI Visibility Audit
            </div>
            <h1 className="text-[clamp(2.4rem,6vw,4rem)] leading-[1.05] tracking-tight text-[#141414]"
              style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600 }}>
              Is your brand visible<br />
              inside AI responses?
            </h1>
            <p className="text-[#6C6C6C] text-lg leading-relaxed max-w-lg">
              Enter your URL. We'll probe ChatGPT, Claude, Perplexity, and Gemini — then tell you exactly where you're missing and how to fix it.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6C6C6C] text-sm font-mono select-none">
                  https://
                </span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="yourcompany.com"
                  className="w-full pl-[5.5rem] pr-4 py-3.5 bg-white border border-[#E5E2DC] rounded-lg text-[#141414] text-sm placeholder:text-[#ABABAB] focus:outline-none focus:ring-2 focus:ring-[#141414]/20 focus:border-[#141414] transition-all"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="px-6 py-3.5 bg-[#141414] text-[#FAFAF8] text-sm font-medium rounded-lg hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-[#FAFAF8]/30 border-t-[#FAFAF8] rounded-full animate-spin" />
                    Starting…
                  </span>
                ) : 'Run Analysis'}
              </button>
            </div>
            {error && <p className="text-sm text-[#b91c1c] pl-1">{error}</p>}
          </form>

          {/* Platforms */}
          <div className="flex items-center gap-6 pt-2">
            <span className="text-xs text-[#ABABAB] font-mono">Probes</span>
            {[
              { name: 'ChatGPT', icon: '/logos/ChatGPT-Logo.svg' },
              { name: 'Claude', icon: '/logos/claude-color.svg' },
              { name: 'Perplexity', icon: '/logos/Perplexity--Streamline-Simple-Icons.svg' },
              { name: 'Gemini', icon: '/logos/gemini-color.svg' },
            ].map(({ name, icon }) => (
              <span key={name} className="text-xs text-[#6C6C6C] flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon} alt="" width={14} height={14} className="shrink-0" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-[#E5E2DC] flex items-center justify-between">
        <span className="text-xs text-[#ABABAB]">Analysis takes 2–4 minutes. No account required.</span>
        <span className="text-xs text-[#ABABAB] font-mono">v1</span>
      </footer>
    </main>
  )
}
