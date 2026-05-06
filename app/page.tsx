'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Zap, ArrowRight } from 'lucide-react'
import { getSupabaseClient } from '@/lib/db/client'

const LLM_PLATFORMS = [
  { name: 'ChatGPT',    icon: '/logos/ChatGPT-Logo.svg' },
  { name: 'Claude',     icon: '/logos/claude-color.svg' },
  { name: 'Gemini',     icon: '/logos/gemini-color.svg' },
  { name: 'Perplexity', icon: '/logos/Perplexity--Streamline-Simple-Icons.svg' },
]

const FEATURES = [
  {
    title: 'See where you rank',
    description:
      "Compare how often you're mentioned by ChatGPT, Claude, Gemini, and Perplexity against your competitive set.",
    img: '/img/rank.png',
  },
  {
    title: 'Know your sources',
    description:
      "Discover which websites, reviews, and articles are shaping your brand's AI reputation.",
    img: '/img/sources.png',
  },
  {
    title: 'Improve your visibility',
    description:
      'Get specific, prioritised recommendations on where to publish, which sources to influence, and how to grow your AI presence.',
    img: '/img/recommendation.png',
  },
]

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [blurPhase, setBlurPhase] = useState<'focusing' | 'clear' | 'blurred'>('focusing')
  const [animKey, setAnimKey] = useState(0)

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
    <div className="min-h-screen bg-[#FAFAF8] text-[#141414] overflow-x-hidden antialiased">

      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC] bg-[#FAFAF8]">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: '20px', width: 'auto' }} />
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
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-28 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center fade-up">

          {/* Headline */}
          <h1 className="text-6xl lg:text-8xl font-semibold tracking-[-0.035em] text-[#141414] mb-8 leading-[0.95]">
            Is your brand<br className="hidden sm:block" />{' '}
            <span
              key={animKey}
              data-blur-phase={blurPhase}
              onAnimationEnd={() => setBlurPhase('clear')}
              onMouseEnter={() => setBlurPhase('blurred')}
              onMouseLeave={() => { setBlurPhase('focusing'); setAnimKey(k => k + 1) }}
            >visible</span>{' '}to AI?
          </h1>

          <p className="text-lg lg:text-xl text-[#6C6C6C] mb-10 max-w-2xl mx-auto leading-relaxed">
            Know where you stand across major LLMs, understand your citation sources,
            and unlock your brand's potential through real AI visibility insights.
          </p>

          {/* Input bar */}
          <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto mb-10">
            <div className="relative flex items-center p-2 bg-white border border-[#E5E2DC] rounded-2xl focus-within:border-[#141414] focus-within:ring-1 focus-within:ring-[#141414] transition-all">
              <div className="pl-3 pr-2 text-[#ABABAB] shrink-0">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourcompany.com"
                className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-[#141414] placeholder-[#ABABAB] py-3 outline-none text-[15px]"
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-[#141414] text-[#FAFAF8] hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Run analysis
                  </>
                )}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-500 mt-2 text-left pl-2">{error}</p>
            )}
          </form>

          {/* LLM platform pills */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#ABABAB]">
              Coverage across
            </span>
            <div className="flex flex-wrap justify-center items-center gap-2">
              {LLM_PLATFORMS.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 rounded-full text-sm font-medium text-[#6C6C6C] bg-white border border-[#E5E2DC]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.icon} alt="" width={16} height={16} className="shrink-0" />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#F3F2EF]">
        <div className="max-w-6xl mx-auto space-y-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="relative bg-white border border-[#E5E2DC] rounded-3xl px-10 pt-12 pb-0 overflow-hidden"
            >
              <div className="text-center max-w-2xl mx-auto mb-12">
                <h3 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#141414] mb-4">
                  {f.title}
                </h3>
                <p className="text-[#6C6C6C] text-base sm:text-lg leading-relaxed">
                  {f.description}
                </p>
              </div>
              <div className="w-full bg-[#F3F2EF] rounded-2xl rounded-b-none p-2 pb-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.img}
                  alt={f.title}
                  className="w-full rounded-xl rounded-b-none border border-[#E5E2DC] border-b-0 block"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────── */}
      <section className="px-6 py-20 bg-[#FAFAF8]">
        <div className="relative max-w-5xl mx-auto rounded-3xl overflow-hidden bg-[#141414]">
          <div className="relative px-8 py-16 lg:px-16 lg:py-20 text-center">
            <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight text-white mb-5 leading-[1.05]">
              Ready to understand{' '}
              <br className="hidden sm:block" />
              your AI visibility?
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto mb-8">
              No account required. Get your full AI visibility report in minutes.
            </p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold bg-white text-[#141414] hover:bg-[#F3F2EF] transition-colors"
            >
              Run free analysis <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E2DC] py-10 px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: '18px', width: 'auto' }} />
            <span className="text-sm text-[#ABABAB]">AI visibility for modern businesses.</span>
          </div>
          <span className="text-sm text-[#ABABAB]">© 2026 Percelo Inc.</span>
        </div>
      </footer>

    </div>
  )
}
