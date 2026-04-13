import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getReport, getScoresByReport, getRecommendationsByReport, getProbesByReport } from '@/lib/db/queries'
import { ProbeExplorer } from '@/components/probe-explorer'
import { getUser } from '@/lib/supabase/server'
import { ShareButton } from '@/components/share-button'
import type { Score, ScoreCategory } from '@/lib/db/types'

interface Props {
  params: Promise<{ id: string }>
}

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  category_association: 'Category Association',
  retrieval: 'Source Retrieval',
  entity: 'Entity Recognition',
  social_proof: 'Social Proof',
}

const CATEGORY_DESCRIPTIONS: Record<ScoreCategory, string> = {
  category_association: 'Do AI models mention you when asked about your category?',
  retrieval: 'Are you cited as a source in AI responses?',
  entity: 'Do AI models understand who you are?',
  social_proof: 'Do third-party sources validate your authority?',
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
            <h1 className="text-xl text-[#141414]" style={{ fontFamily: 'var(--font-fraunces)' }}>Analysis failed</h1>
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

  // Sort scores by priority (descending) for the action queue
  const sortedByPriority = [...scores].sort((a, b) => b.priority_score - a.priority_score)
  const topRecs = recommendations.slice(0, 3)

  // Overall score: average of all 4
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.raw_score, 0) / scores.length)
    : 0

  const probeCount = 20 // approximate

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
                  style={{ fontFamily: 'var(--font-fraunces)', fontVariationSettings: "'opsz' 72, 'wght' 600" }}
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
            <span>{probeCount}+ probes</span>
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

        {/* Score cards — 2×2 grid */}
        <div className="grid grid-cols-2 gap-4 mb-12 fade-up fade-up-1">
          {sortedByPriority.map((score, i) => (
            <ScoreCard key={score.id} score={score} reportId={id} delay={i} companyName={report.company_name ?? ''} />
          ))}
        </div>

        {/* Priority action queue */}
        {topRecs.length > 0 && (
          <div className="space-y-4 fade-up fade-up-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Priority Actions</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>

            <div className="space-y-2">
              {topRecs.map((rec, i) => (
                <div
                  key={rec.id}
                  className="flex items-start gap-4 rounded-lg border border-[#E5E2DC] bg-white px-5 py-4"
                >
                  <span className="score-number text-xl text-[#CDCBC6] shrink-0">{i + 1}</span>
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
                      href={`/report/${id}/${rec.type}`}
                      className="shrink-0 text-xs text-[#6C6C6C] hover:text-[#141414] font-mono transition-colors"
                    >
                      View →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Probe results */}
        {probes.length > 0 && (
          <div className="space-y-4 fade-up fade-up-4 pt-8 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Probe Results</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
              <span className="text-xs font-mono text-[#ABABAB]">{probes.filter(p => p.status === 'complete').length} probes</span>
            </div>
            <ProbeExplorer probes={probes} companyName={report.company_name ?? ''} />
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

function categoryDiagnostic(score: Score, companyName: string): string {
  const cat = score.category as ScoreCategory
  const c = score.component_scores_json
  const name = companyName || 'This brand'

  switch (cat) {
    case 'category_association': {
      const mentionPts = c.mention_rate ?? 0
      const consistency = c.cross_platform ?? 0
      const gap = c.competitor_gap ?? 0
      const mentionStr = mentionPts >= 28 ? 'frequently mentioned' : mentionPts >= 16 ? 'sometimes mentioned' : 'rarely mentioned'
      const gapStr = gap >= 20 ? 'competitive with peers' : gap >= 10 ? 'somewhat behind competitors' : 'significantly behind competitors in share-of-voice'
      const consistencyStr = consistency >= 15 ? 'consistently across platforms' : 'inconsistently across platforms'
      return `${name} is ${mentionStr} when users ask AI about its category, and appears ${consistencyStr}. It is ${gapStr}.`
    }
    case 'retrieval': {
      const citation = c.citation_rate ?? 0
      const roundup = c.roundup_presence ?? 0
      const citedStr = citation >= 20 ? 'frequently cited as a direct source' : citation >= 10 ? 'occasionally cited as a source' : 'rarely cited as a direct source'
      const roundupStr = roundup >= 15 ? 'appears in AI roundup responses' : 'is not appearing in AI roundup responses'
      return `${name} is ${citedStr} by AI models that use web retrieval. It ${roundupStr}, which are high-value visibility moments.`
    }
    case 'entity': {
      const schema = c.schema_markup ?? 0
      const profile = c.profile_completeness ?? 0
      const consistency = c.description_consistency ?? 0
      const wiki = c.wikipedia_presence ?? 0
      const schemaStr = schema >= 15 ? 'has structured schema markup' : 'is missing structured schema markup'
      const profileStr = profile >= 15 ? 'well-represented on key directories' : profile >= 8 ? 'partially represented on directories' : 'underrepresented on key directories'
      const consistencyStr = consistency >= 30 ? 'consistently described across sources' : consistency >= 15 ? 'described somewhat inconsistently' : 'described inconsistently across the web'
      return `${name} ${schemaStr} and is ${profileStr} like G2, LinkedIn, and Crunchbase. It is ${consistencyStr}${wiki === 0 ? ' with no Wikipedia presence detected' : ''}.`
    }
    case 'social_proof': {
      const g2 = c.g2_presence ?? 0
      const capterra = c.capterra_presence ?? 0
      const reddit = c.reddit_mentions ?? 0
      const listicle = c.listicle_appearances ?? 0
      const reviewStr = (g2 + capterra) >= 25 ? 'strong review platform coverage' : (g2 + capterra) >= 12 ? 'partial review coverage' : 'limited review platform presence'
      const communityStr = reddit >= 15 ? 'active community discussion' : reddit >= 8 ? 'some community discussion' : 'minimal community discussion'
      const listicleStr = listicle >= 18 ? 'appears in key category listicles' : 'is underrepresented in category listicles'
      return `${name} has ${reviewStr} and ${communityStr} on forums. It ${listicleStr} that AI models reference when recommending tools.`
    }
    default:
      return ''
  }
}

function ScoreCard({ score, reportId, delay, companyName }: { score: Score; reportId: string; delay: number; companyName: string }) {
  const cat = score.category as ScoreCategory
  const label = CATEGORY_LABELS[cat] ?? cat
  const sev = severityLabel(score.raw_score)
  const sevClass = severityClass(score.raw_score)
  const bgClass = severityBgClass(score.raw_score)
  const diagnostic = categoryDiagnostic(score, companyName)

  return (
    <Link
      href={`/report/${reportId}/${score.category}`}
      className={`fade-up fade-up-${delay + 1} group block rounded-lg border p-5 bg-white hover:border-[#141414]/20 transition-all duration-200`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-mono text-[#6C6C6C] uppercase tracking-widest">{label}</p>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${bgClass} uppercase tracking-wide shrink-0`}>
            {sev}
          </span>
        </div>
        <div className={`score-number text-[3.5rem] leading-none ${sevClass}`}>
          {score.raw_score}
        </div>
        <div className="h-1 bg-[#F3F2EF] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              score.raw_score >= 80 ? 'severity-bar-healthy' :
              score.raw_score >= 60 ? 'severity-bar-moderate' :
              score.raw_score >= 40 ? 'severity-bar-weak' : 'severity-bar-critical'
            }`}
            style={{ width: `${score.raw_score}%` }}
          />
        </div>
        {diagnostic && (
          <p className="text-xs text-[#6C6C6C] leading-relaxed">{diagnostic}</p>
        )}
        <div className="pt-1">
          <span className="inline-flex items-center gap-1 text-xs text-[#141414] font-medium group-hover:gap-2 transition-all">
            See recommendations <span>→</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
