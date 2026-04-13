import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getReport, getScoresByReport, getRecommendationsByReport, getProbesByReport } from '@/lib/db/queries'
import { ProbeExplorer } from '@/components/probe-explorer'
import { getUser } from '@/lib/supabase/server'
import { ShareButton } from '@/components/share-button'
import type { Score, Recommendation, ScoreCategory } from '@/lib/db/types'

interface Props {
  params: Promise<{ id: string }>
}

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  category_association: 'Category Association',
  retrieval: 'Source Retrieval',
  entity: 'Entity Recognition',
  social_proof: 'Social Proof',
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
}

function guessCompetitorDomain(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
}

function severityLabel(score: number): string {
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Critical'
}

function severityClass(score: number): string {
  if (score >= 80) return 'severity-healthy'
  if (score >= 60) return 'severity-moderate'
  if (score >= 40) return 'severity-weak'
  return 'severity-critical'
}

function severityBgClass(score: number): string {
  if (score >= 80) return 'severity-bg-healthy'
  if (score >= 60) return 'severity-bg-moderate'
  if (score >= 40) return 'severity-bg-weak'
  return 'severity-bg-critical'
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params
  const report = await getReport(id)

  if (!report) redirect('/')
  if (report.status === 'pending' || report.status === 'running') {
    redirect(`/report/${id}/loading`)
  }

  if (report.status === 'failed') {
    return (
      <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
        <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: "20px", width: "auto" }} />
          <span className="text-xs text-[#6C6C6C]">Beta</span>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <h1 className="text-xl text-[#141414]" style={{ fontFamily: 'var(--font-geist-sans)' }}>Analysis failed</h1>
            <p className="text-sm text-[#6C6C6C]">Something went wrong. Please try again.</p>
            <a href="/" className="text-sm text-[#141414] underline underline-offset-2">Start a new analysis</a>
          </div>
        </div>
      </main>
    )
  }

  const [scores, recommendations, probes, user] = await Promise.all([
    getScoresByReport(id),
    getRecommendationsByReport(id),
    getProbesByReport(id),
    getUser(),
  ])

  const isSaved = !!report.user_id
  const isOwner = user && report.user_id === user.id
  const showSaveBanner = !isSaved

  // Overall score: weighted — category_association dominates since it directly measures
  // whether customers encounter the brand in ChatGPT/Claude responses
  const SCORE_WEIGHTS: Record<string, number> = {
    category_association: 0.50,
    social_proof: 0.20,
    retrieval: 0.20,
    entity: 0.10,
  }
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => {
        const w = SCORE_WEIGHTS[s.category] ?? 0.25
        return sum + s.raw_score * w
      }, 0))
    : 0

  const probeCount = probes.filter(p => p.status === 'complete').length

  // Foundation scores (entity + social_proof)
  const foundationScores = scores.filter(s =>
    s.category === 'entity' || s.category === 'social_proof'
  )

  // Recommendations for category_association + retrieval (engine-visible recs)
  const engineRecs = recommendations.filter(r =>
    r.type === 'category_association' || r.type === 'retrieval'
  )

  return (
    <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
      {/* Top bar */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: "20px", width: "auto" }} />
        </Link>
        <div className="flex items-center gap-4">
          {user && (
            <Link href="/dashboard" className="text-xs font-mono text-[#6C6C6C] hover:text-[#141414] transition-colors">
              Dashboard
            </Link>
          )}
          <span className="text-xs text-[#6C6C6C]">Beta</span>
        </div>
      </header>

      {/* Save banner */}
      {showSaveBanner && (
        <div className="border-b border-[#E5E2DC] bg-white px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <p className="text-xs text-[#6C6C6C]">
              To save and share these results, please create an account.
            </p>
            <Link
              href={`/auth?save=${id}`}
              className="shrink-0 text-xs font-medium text-[#141414] bg-[#141414] text-[#FAFAF8] px-4 py-1.5 rounded-md hover:bg-[#2a2a2a] transition-colors"
            >
              Save results
            </Link>
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {isOwner && (
        <div className="border-b border-[#E5E2DC] bg-[#f0fdf4] px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <p className="text-xs text-[#16a34a]">
              Saved to your account.
            </p>
            <div className="flex items-center gap-3">
              <ShareButton reportId={id} />
              <Link href="/dashboard" className="text-xs font-mono text-[#16a34a] hover:text-[#141414] transition-colors">
                View dashboard →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-6 py-12 max-w-4xl mx-auto w-full">

        {/* Report header */}
        <div className="space-y-4 mb-12 fade-up">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-[#ABABAB] tracking-widest uppercase">
                AI Visibility Report
              </div>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={faviconUrl(new URL(report.url).hostname)}
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-md"
                />
                <h1
                  className="text-[clamp(2rem,5vw,3.2rem)] leading-[1.05] tracking-tight text-[#141414]"
                  style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600 }}
                >
                  {report.company_name ?? new URL(report.url).hostname}
                </h1>
              </div>
              {report.category && (
                <p className="text-sm text-[#6C6C6C]">{report.category}</p>
              )}
            </div>

            {/* Overall score */}
            <div className="shrink-0 text-right">
              <div className={`score-number text-5xl ${severityClass(overallScore)}`}>{overallScore}</div>
              <div className="text-xs text-[#ABABAB] mt-0.5">{severityLabel(overallScore)} overall</div>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#ABABAB] font-mono">
            <span>{probeCount} probes</span>
            <span className="w-1 h-1 rounded-full bg-[#CDCBC6]" />
            <span>4 platforms</span>
            <span className="w-1 h-1 rounded-full bg-[#CDCBC6]" />
            <span>{report.completed_at ? new Date(report.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
          </div>

          {/* Competitor chips */}
          {report.competitors.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#ABABAB] font-mono mr-1">vs</span>
              {report.competitors.map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-1.5 rounded-full border border-[#E5E2DC] pl-1 pr-3 py-0.5 text-xs text-[#6C6C6C] bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={faviconUrl(guessCompetitorDomain(c))}
                    alt=""
                    width={14}
                    height={14}
                    className="rounded-sm"
                  />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Engine-first probe view */}
        {probes.length > 0 && (
          <div className="space-y-0 fade-up fade-up-1 mb-12">
            <ProbeExplorer probes={probes} companyName={report.company_name ?? ''} />
          </div>
        )}

        {/* Foundation section */}
        {foundationScores.length > 0 && (
          <div className="space-y-4 fade-up fade-up-2 mb-12">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Foundation</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
              <span className="text-xs font-mono text-[#ABABAB]">signals that influence all engines</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {foundationScores.map((score) => (
                <FoundationCard key={score.id} score={score} reportId={id} />
              ))}
            </div>
          </div>
        )}

        {/* What to improve */}
        {engineRecs.length > 0 && (
          <div className="space-y-4 fade-up fade-up-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">What to improve</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>

            <div className="space-y-2">
              {engineRecs.map((rec, i) => (
                <RecCard key={rec.id} rec={rec} reportId={id} index={i} />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-[#E5E2DC] flex items-center justify-between">
        <Link href="/" className="text-xs text-[#ABABAB] hover:text-[#6C6C6C] transition-colors">
          ← New analysis
        </Link>
        <span className="text-xs text-[#ABABAB] font-mono">v1</span>
      </footer>
    </main>
  )
}

function FoundationCard({ score, reportId }: { score: Score; reportId: string }) {
  const cat = score.category as ScoreCategory
  const label = CATEGORY_LABELS[cat] ?? cat
  const sev = severityLabel(score.raw_score)
  const sevClass = severityClass(score.raw_score)
  const bgClass = severityBgClass(score.raw_score)

  return (
    <Link
      href={`/report/${reportId}/${score.category}`}
      className="group block rounded-lg border border-[#E5E2DC] p-4 bg-white hover:border-[#141414]/20 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs font-mono text-[#6C6C6C] uppercase tracking-widest">{label}</p>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${bgClass} uppercase tracking-wide shrink-0`}>
          {sev}
        </span>
      </div>
      <div className={`score-number text-3xl leading-none mb-3 ${sevClass}`}>
        {score.raw_score}
      </div>
      <div className="h-1 bg-[#F3F2EF] rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            score.raw_score >= 80 ? 'severity-bar-healthy' :
            score.raw_score >= 60 ? 'severity-bar-moderate' :
            score.raw_score >= 40 ? 'severity-bar-weak' : 'severity-bar-critical'
          }`}
          style={{ width: `${score.raw_score}%` }}
        />
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-[#141414] font-medium group-hover:gap-2 transition-all">
        See recommendations <span>→</span>
      </span>
    </Link>
  )
}

function RecCard({ rec, reportId, index }: { rec: Recommendation; reportId: string; index: number }) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-[#E5E2DC] bg-white px-5 py-4">
      <span className="score-number text-xl text-[#CDCBC6] shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-[#141414]">{rec.title}</p>
          <span className="rounded-full border border-[#E5E2DC] px-2 py-0.5 text-[10px] font-mono text-[#6C6C6C] shrink-0 uppercase tracking-wide">
            {CATEGORY_LABELS[rec.type as ScoreCategory]?.split(' ')[0] ?? rec.type}
          </span>
        </div>
        {rec.why_it_matters && (
          <p className="text-xs text-[#6C6C6C] leading-relaxed">{rec.why_it_matters}</p>
        )}
        {rec.effort && (
          <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-wide">Effort: {rec.effort}</p>
        )}
      </div>
      {rec.type && (
        <Link
          href={`/report/${reportId}/${rec.type}`}
          className="shrink-0 text-xs text-[#6C6C6C] hover:text-[#141414] font-mono transition-colors"
        >
          View →
        </Link>
      )}
    </div>
  )
}
