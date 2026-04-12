'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">
          GEO Visibility
        </span>
        <span className="text-xs text-[#6C6C6C]">Beta</span>
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
              style={{ fontFamily: 'var(--font-fraunces)', fontVariationSettings: "'opsz' 72, 'wght' 600" }}>
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
            {['ChatGPT', 'Claude', 'Perplexity', 'Gemini'].map((p) => (
              <span key={p} className="text-xs text-[#6C6C6C] flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#CDCBC6]" />
                {p}
              </span>
            ))}
          </div>

          {/* Stats row */}
          <div className="pt-4 border-t border-[#E5E2DC] grid grid-cols-3 gap-6">
            {[
              { n: '4', label: 'AI platforms' },
              { n: '20+', label: 'Probe prompts' },
              { n: '4', label: 'Visibility scores' },
            ].map(({ n, label }) => (
              <div key={label}>
                <div className="score-number text-2xl text-[#141414]">{n}</div>
                <div className="text-xs text-[#6C6C6C] mt-0.5">{label}</div>
              </div>
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
