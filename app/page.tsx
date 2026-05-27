'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Zap, ArrowRight, Globe, Lightbulb } from 'lucide-react'

function PodiumIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="m12 7.09 2.45 1.49-.65-2.81L16 3.89l-2.89-.25L12 1l-1.13 2.64L8 3.89l2.18 1.88-.68 2.81zm-8 6 2.45 1.49-.65-2.81L8 9.89l-2.89-.25L4 7 2.87 9.64 0 9.89l2.18 1.88-.68 2.81zm16-3 2.45 1.49-.65-2.81L24 6.89l-2.89-.25L20 4l-1.13 2.64-2.87.25 2.18 1.88-.68 2.81zM15 23H9V10h6zm-8 0H1v-6h6zm16 0h-6V13h6z"/>
    </svg>
  )
}
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
    icon: PodiumIcon,
  },
  {
    title: 'Know your sources',
    description:
      "Discover which websites, reviews, and articles are shaping your brand's AI reputation.",
    icon: Globe,
  },
  {
    title: 'Improve your visibility',
    description:
      'Get specific, prioritised recommendations on where to publish, which sources to influence, and how to grow your AI presence.',
    icon: Lightbulb,
  },
]

function ReportPreview() {
  const r = 28
  const circ = 2 * Math.PI * r
  return (
    <div className="w-[380px] rounded-2xl border border-[#E5E2DC] bg-white shadow-[0_16px_64px_-12px_rgba(0,0,0,0.12)] overflow-hidden select-none pointer-events-none">

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-[#E5E2DC]">
        {/* AI VISIBILITY REPORT label + share */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1.5 w-24 rounded-full bg-[#E5E2DC]" />
          <div className="h-1.5 w-12 rounded-full bg-[#E5E2DC]" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Company name */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded-full bg-[#E5E2DC] shrink-0" />
              <div className="h-4 w-16 rounded-md bg-[#141414]/10" />
            </div>
            {/* Description */}
            <div className="h-1.5 w-52 rounded-full bg-[#E5E2DC] mb-1" />
            {/* Meta row */}
            <div className="flex items-center gap-1.5 mt-2">
              <div className="h-1.5 w-10 rounded-full bg-[#E5E2DC]" />
              <div className="w-0.5 h-0.5 rounded-full bg-[#E5E2DC]" />
              <div className="h-1.5 w-12 rounded-full bg-[#E5E2DC]" />
              <div className="w-0.5 h-0.5 rounded-full bg-[#E5E2DC]" />
              <div className="h-1.5 w-16 rounded-full bg-[#E5E2DC]" />
            </div>
          </div>
          {/* Donut */}
          <svg viewBox="0 0 72 72" width="68" height="68" className="shrink-0 -mt-1">
            <circle cx="36" cy="36" r={r} fill="none" stroke="#F3F2EF" strokeWidth="9" />
            <circle cx="36" cy="36" r={r} fill="none" stroke="#22c55e" strokeWidth="9"
              strokeDasharray={`${0.88 * circ} ${circ}`}
              strokeLinecap="round"
              transform="rotate(-90 36 36)"
            />
            <text x="36" y="33" textAnchor="middle" fontSize="13" fontWeight="700" fill="#141414">88</text>
            <text x="36" y="44" textAnchor="middle" fontSize="6.5" fill="#6C6C6C" letterSpacing="0.8">STRONG</text>
          </svg>
        </div>
        {/* Tab bar */}
        <div className="flex gap-1 mt-4">
          {['Overview', 'Prompts', 'Citations', 'Actions'].map((t, i) => (
            <div key={t} className={`px-2.5 py-1 rounded-md text-[9px] font-medium ${i === 0 ? 'bg-[#F3F2EF] text-[#141414]' : 'text-[#ABABAB]'}`}>{t}</div>
          ))}
        </div>
      </div>

      {/* ── Overall Visibility ── */}
      <div className="px-5 py-4 border-b border-[#E5E2DC] flex gap-4">
        <div className="w-[88px] shrink-0 space-y-1.5 pt-0.5">
          <div className="h-2 w-20 rounded-md bg-[#141414]/10" />
          <div className="h-1.5 w-16 rounded-full bg-[#E5E2DC]" />
          <div className="h-1.5 w-14 rounded-full bg-[#E5E2DC]" />
          <div className="h-1.5 w-16 rounded-full bg-[#E5E2DC]" />
        </div>
        <div className="flex-1 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-[#86efac]" />
          <div className="h-1.5 w-[88%] rounded-full bg-[#86efac]" />
          <div className="h-1.5 w-[94%] rounded-full bg-[#86efac]" />
          <div className="h-1.5 w-[78%] rounded-full bg-[#86efac]" />
          <div className="h-1.5 w-[90%] rounded-full bg-[#86efac]" />
        </div>
      </div>

      {/* ── Top Actions ── */}
      <div className="px-5 py-4 border-b border-[#E5E2DC] flex gap-4">
        <div className="w-[88px] shrink-0 space-y-1.5 pt-0.5">
          <div className="h-2 w-16 rounded-md bg-[#141414]/10" />
          <div className="h-1.5 w-14 rounded-full bg-[#E5E2DC]" />
          <div className="h-1.5 w-16 rounded-full bg-[#E5E2DC]" />
        </div>
        <div className="flex-1 rounded-lg border border-[#E5E2DC] overflow-hidden">
          {[80, 68, 58, 50].map((w, i) => (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 ${i < 3 ? 'border-b border-[#E5E2DC]' : ''}`}>
              <span className="text-[8px] text-[#ABABAB] font-mono shrink-0 w-2.5">{i + 1}</span>
              <div className="h-1.5 rounded-full bg-[#E5E2DC]" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Competitive Ranking ── */}
      <div className="px-5 py-4 flex gap-4">
        <div className="w-[88px] shrink-0 space-y-1.5 pt-0.5">
          <div className="h-2 w-20 rounded-md bg-[#141414]/10" />
          <div className="h-1.5 w-16 rounded-full bg-[#E5E2DC]" />
          <div className="h-1.5 w-14 rounded-full bg-[#E5E2DC]" />
        </div>
        <div className="flex-1 space-y-2">
          {[
            { w: '85%', dark: true },
            { w: '65%', dark: false },
            { w: '50%', dark: false },
            { w: '48%', dark: false },
            { w: '38%', dark: false },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-14 h-4 rounded-md shrink-0 ${row.dark ? 'bg-[#141414]' : 'bg-[#F3F2EF]'}`} />
              <div className="flex-1 h-1.5 rounded-full bg-[#F3F2EF] overflow-hidden">
                <div className="h-full rounded-full bg-[#ABABAB]" style={{ width: row.w }} />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

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
      <header className="border-b border-[#E5E2DC] bg-[#FAFAF8]">
        <div className="max-w-[1024px] mx-auto w-full py-5 flex items-center justify-between">
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
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-28 px-6 overflow-hidden">
        <div className="max-w-[1024px] mx-auto fade-up">
          <div className="flex items-center gap-16">
          <div className="flex-1 min-w-0">

          {/* Headline */}
          <h1 className="text-[3rem] lg:text-[4.8rem] font-semibold tracking-[-0.035em] mb-8 leading-[0.95]" style={{ background: 'linear-gradient(to bottom, #3100D3, #000000)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Is your brand<br className="hidden sm:block" />{' '}
            <span
              key={animKey}
              data-blur-phase={blurPhase}
              onAnimationEnd={() => setBlurPhase('clear')}
              onMouseEnter={() => setBlurPhase('blurred')}
              onMouseLeave={() => { setBlurPhase('focusing'); setAnimKey(k => k + 1) }}
              style={{ background: 'linear-gradient(to bottom, #3100D3, #000000)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
            >visible</span>{' '}to AI?
          </h1>

          <p className="text-lg text-[#6C6C6C] mb-10 leading-relaxed">
            Know where you stand across major LLMs, understand your citation sources,
            and unlock your brand's potential through real AI visibility insights.
          </p>

          {/* Input bar */}
          <form onSubmit={handleSubmit} className="w-full max-w-xl mb-10">
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
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#ABABAB]">
              Coverage across
            </span>
            <div className="flex flex-wrap items-center gap-2">
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
          </div>{/* end left col */}

          {/* Right: abstract report preview */}
          <div className="shrink-0 hidden lg:block">
            <ReportPreview />
          </div>

          </div>{/* end flex row */}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="border-t border-[#E5E2DC] bg-[#FAFAF8] px-6 py-20">
        <div className="max-w-[1024px] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="rounded-2xl bg-white border border-[#E5E2DC] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] p-8 flex flex-col">
                <div className="w-10 h-10 rounded-xl bg-[#F0EEFF] flex items-center justify-center text-[#3100D3] mb-5 shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-[#141414] mb-2">{f.title}</h3>
                <p className="text-sm text-[#6C6C6C] leading-relaxed">{f.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────── */}
      <section className="border-t border-[#E5E2DC] px-6 py-20 bg-[#FAFAF8]">
        <div className="relative max-w-[1024px] mx-auto rounded-3xl overflow-hidden bg-[#F3F2EF] border border-[#E5E2DC]">
          <div className="relative px-8 py-16 lg:px-16 lg:py-20 text-center">
            <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight text-[#141414] mb-5 leading-[1.05]">
              Ready to understand{' '}
              <br className="hidden sm:block" />
              your AI visibility?
            </h2>
            <p className="text-[#6C6C6C] text-lg max-w-xl mx-auto mb-8">
              No account required. Get your full AI visibility report in minutes.
            </p>
            <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto">
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
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E2DC] py-10 px-6">
        <div className="max-w-[1024px] mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-4">
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
