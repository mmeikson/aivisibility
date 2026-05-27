import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getReport, getScoresByReport, getRecommendationsByReport, getProbesByReport, updateReport } from '@/lib/db/queries'
import { ProbeExplorer } from '@/components/probe-explorer'
import { SourceGapAnalysis } from '@/components/source-gap-analysis'
import { computeSourceGaps, SOURCE_GAP_VERSION } from '@/lib/analysis/source-gaps'
import { computeInsights } from '@/lib/analysis/insights'
import { InsightsSection } from '@/components/insights-section'
import { CompetitorQuadrant, type CompetitorPoint } from '@/components/competitor-quadrant'
import { ReportTabs } from '@/components/report-tabs'
import { InfluentialPublications } from '@/components/influential-publications'
import { getUser } from '@/lib/supabase/server'
import { ShareButton } from '@/components/share-button'
import { ViewAllRecsButton } from '@/components/view-all-recs-button'
import type { Score, Recommendation } from '@/lib/db/types'

interface Props {
  params: Promise<{ id: string }>
}


function buildSummary(
  companyName: string,
  category: string,
  overallScore: number,
  scores: Score[]
): string {
  // Sentence 1 — overall standing
  let s1: string
  const catScore = scores.find(s => s.category === 'category_association')?.raw_score ?? 0
  if (overallScore >= 80) {
    s1 = `${companyName} is well covered by AI engines and consistently surfaces in ${category} queries.`
  } else if (overallScore >= 60) {
    const strong = catScore >= 70 ? 'solid category association' : 'growing presence'
    s1 = `${companyName} has ${strong} in the ${category} space, though there are meaningful gaps to close.`
  } else if (overallScore >= 40) {
    s1 = `${companyName} has weak AI visibility in the ${category} category — AI engines mention it in some queries but miss it in most.`
  } else {
    s1 = `${companyName} has very limited AI visibility in the ${category} space, and AI engines rarely surface it in discovery or recommendation queries.`
  }

  // Sentence 2 — top opportunity (lowest-scoring weighted component)
  const COMPONENT_ACTIONS: Record<string, string> = {
    // category_association
    parametric_score: 'building more AI-indexed content in your category',
    retrieval_score: 'increasing retrieval-platform visibility for your category',
    win_rate: 'closing the visibility gap against leading competitors',
    // retrieval
    mention_rate: 'building more AI-indexed content in your category',
    roundup_presence: 'earning placement in category comparison and roundup articles',
    citation_rate: 'making your site a citable source for AI retrieval engines',
    recommendation_quality: 'increasing the confidence with which AI models recommend you',
    // entity
    entity_disambiguation: 'clarifying your brand identity to reduce AI confusion',
    // social proof
    listicle_appearances: 'getting featured in best-of category articles',
    review_presence: 'building third-party review presence for your brand',
  }

  const COMPONENT_MAX: Record<string, number> = {
    parametric_score: 50, retrieval_score: 50, win_rate: 20,
    mention_rate: 50, roundup_presence: 30, citation_rate: 10, recommendation_quality: 10,
    entity_disambiguation: 100,
    listicle_appearances: 50, review_presence: 50,
  }

  let worstKey = ''
  let worstGap = -1
  for (const score of scores) {
    for (const [key, pts] of Object.entries(score.component_scores_json)) {
      const max = COMPONENT_MAX[key] ?? (key.includes('.') ? 20 : undefined)
      if (!max) continue
      const gap = max - (pts as number)
      if (gap > worstGap) { worstGap = gap; worstKey = key }
    }
  }

  const action = worstKey && (COMPONENT_ACTIONS[worstKey] ?? (worstKey.includes('.') ? `building your profile on ${worstKey}` : undefined))
    ? `consider ${COMPONENT_ACTIONS[worstKey] ?? `building your profile on ${worstKey}`}`
    : 'focus on expanding your brand footprint across AI-indexed sources'

  const s2 = overallScore >= 80
    ? `To further strengthen your position, ${action}.`
    : `Your most impactful near-term opportunity is to ${action}.`

  return `${s1} ${s2}`
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
}

function guessCompetitorDomain(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
}

function severityClass(score: number): string {
  if (score >= 80) return 'severity-healthy'
  if (score >= 60) return 'severity-moderate'
  if (score >= 40) return 'severity-weak'
  return 'severity-critical'
}

function severityBand(score: number): 'healthy' | 'moderate' | 'weak' | 'critical' {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'moderate'
  if (score >= 40) return 'weak'
  return 'critical'
}

function severityColor(score: number): string {
  if (score >= 80) return '#16a34a'
  if (score >= 60) return '#8fa83d'
  if (score >= 40) return '#CEAC01'
  return '#e5534b'
}

function severityLabel(score: number): string {
  if (score >= 80) return 'Strong'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Critical'
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
        <header className="border-b border-[#E5E2DC]"><div className="max-w-[1024px] mx-auto w-full px-6 py-5 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: "20px", width: "auto" }} />
        </div></header>
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

  const ownDomain = (() => { try { return new URL(report.url).hostname.replace(/^www\./, '') } catch { return '' } })()
  const allCompetitors = [
    ...(report.competitors ?? []),
    ...probes.flatMap((p) => p.parsed_json?.competitor_mentions ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i)
  const inf = report.inference_json
  const cached = inf?.source_gap
  let sourceGapResult = (cached?.version === SOURCE_GAP_VERSION) ? cached : null
  if (!sourceGapResult) {
    sourceGapResult = await computeSourceGaps(
      probes,
      allCompetitors,
      ownDomain,
      inf?.company_name ?? '',
      inf?.category ?? '',
      inf?.canonical_description ?? '',
      inf?.primary_use_case ?? '',
      inf?.target_customer ?? '',
    )
    if (inf) {
      await updateReport(id, { inference_json: { ...inf, source_gap: sourceGapResult } })
    }
  }
  const insights = computeInsights(probes)

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

  // Competitor ranking: derive from brand-agnostic probes (discovery, job_to_be_done, ranking)
  const rankingProbes = probes.filter(
    p => ['discovery', 'job_to_be_done', 'ranking'].includes(p.prompt_type) && p.parsed_json !== null
  )
  const rankingTotal = rankingProbes.length

  const competitorPoints: CompetitorPoint[] = report.competitors.map((name) => {
    const mentioned = rankingProbes.filter(p =>
      p.parsed_json!.competitor_mentions.some(c => c.toLowerCase().includes(name.toLowerCase()))
    )
    // Competitors have no per-entity recommendation_strength data — appearing in a
    // brand-agnostic discovery/ranking probe is itself a confident recommendation signal,
    // so mention rate is the correct strength proxy.
    const strength = rankingTotal > 0 ? mentioned.length / rankingTotal : 0
    return {
      name,
      domain: guessCompetitorDomain(name),
      mentions: mentioned.length,
      mentionRate: rankingTotal > 0 ? mentioned.length / rankingTotal : 0,
      strength,
      isTarget: false,
    }
  })

  const brandRankingMentions = rankingProbes.filter(p => p.parsed_json!.was_mentioned)
  const brandStrength = rankingTotal > 0
    ? rankingProbes.reduce((sum, p) => {
        if (!p.parsed_json!.was_mentioned) return sum
        const s = p.parsed_json!.recommendation_strength
        return sum + (s === 'confident' ? 1 : s === 'hedged' ? 0.5 : 0)
      }, 0) / rankingTotal
    : 0

  const quadrantPoints: CompetitorPoint[] = [
    {
      name: report.company_name ?? new URL(report.url).hostname,
      domain: new URL(report.url).hostname,
      mentions: brandRankingMentions.length,
      mentionRate: rankingTotal > 0 ? brandRankingMentions.length / rankingTotal : 0,
      strength: brandStrength,
      isTarget: true,
    },
    ...competitorPoints,
  ]

  return (
    <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
      {/* Top bar */}
      <header className="border-b border-[#E5E2DC]"><div className="max-w-[1024px] mx-auto w-full px-6 py-5 flex items-center justify-between">
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
        </div>
      </div></header>

      {/* Save banner */}
      {showSaveBanner && (
        <div className="border-b border-[#E5E2DC] bg-[#ffffff] px-6 py-3">
          <div className="max-w-[1024px] mx-auto flex items-center justify-between gap-4">
            <p className="text-xs text-[#6C6C6C]">
              To save and share these results, please create an account.
            </p>
            <Link
              href={`/auth?save=${id}`}
              className="shrink-0 text-xs font-medium text-white bg-[#141414] px-4 py-1.5 rounded-md hover:bg-[#333333] transition-colors"
            >
              Save results
            </Link>
          </div>
        </div>
      )}



      {/* Report page header + body */}
      <div className="flex-1 px-6 pt-10 pb-12 max-w-[1024px] mx-auto w-full fade-up">
        <ReportTabs
          recommendations={recommendations}
          headerLeft={
            <div>
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#ABABAB] tracking-widest uppercase">AI Visibility Report</span>
                  <ShareButton reportId={id} />
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
                    className="text-[clamp(1.6rem,4vw,2.6rem)] leading-[1.05] tracking-tight text-[#141414]"
                    style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600 }}
                  >
                    {report.company_name ?? new URL(report.url).hostname}
                  </h1>
                </div>
                {report.category && (
                  <p className="text-base text-[#6C6C6C]">{report.category}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#ABABAB] font-mono">
                <span>{probeCount} probes</span>
                <span className="w-1 h-1 rounded-full bg-[#E5E2DC]" />
                <span>4 platforms</span>
                <span className="w-1 h-1 rounded-full bg-[#E5E2DC]" />
                <span>{report.completed_at ? new Date(report.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
              </div>
            </div>
          }
          headerRight={scores.length > 0 ? (() => {
            const r = 46
            const sw = 7
            const circ = 2 * Math.PI * r
            const filled = (overallScore / 100) * circ
            const color = severityColor(overallScore)
            return (
              <svg viewBox="0 0 120 120" width="192" height="192">
                  <circle cx="60" cy="60" r={r} fill="none" stroke="#E5E2DC" strokeWidth={sw} />
                  <circle
                    cx="60" cy="60" r={r} fill="none"
                    stroke={color}
                    strokeWidth={sw}
                    strokeDasharray={`${filled} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                  <text
                    x="60" y="54" textAnchor="middle" dominantBaseline="central"
                    fontSize="34" fontWeight="700" fill={color}
                    fontFamily="var(--font-geist-sans)"
                  >
                    {overallScore}
                  </text>
                  <text
                    x="60" y="72" textAnchor="middle" dominantBaseline="central"
                    fontSize="11" fontWeight="600" fill={color}
                    fontFamily="var(--font-geist-mono)"
                    letterSpacing="2"
                  >
                    {severityLabel(overallScore).toUpperCase()}
                  </text>
                </svg>
            )
          })() : undefined}
          overview={
            <div className="space-y-10">
              {/* Visibility Assessment */}
              {scores.length > 0 && report.category && (
                <div className="flex gap-8">
                  <div className="w-1/4 shrink-0 pt-1 space-y-1.5">
                    <h2 className="tracking-tight text-[#141414]" style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600, fontSize: '1.5rem' }}>Overall Visibility</h2>
                    <p className="text-xs text-[#ABABAB] leading-relaxed">How often your brand surfaces in AI-generated responses across platforms.</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-lg border border-[#E5E2DC] bg-[#ffffff] px-5 py-5">
                      <p className={`text-2xl leading-snug ${severityClass(overallScore)}`} style={{ fontFamily: 'var(--font-geist-sans)' }}>
                        {buildSummary(report.company_name ?? new URL(report.url).hostname, report.category, overallScore, scores)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick wins */}
              {recommendations.length > 0 && (
                <div className="flex gap-8 fade-up fade-up-1">
                  <div className="w-1/4 shrink-0 pt-1 space-y-1.5">
                    <h2 className="tracking-tight text-[#141414]" style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600, fontSize: '1.5rem' }}>Top Actions</h2>
                    <p className="text-xs text-[#ABABAB] leading-relaxed">Prioritized actions to improve your AI visibility score.</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="rounded-lg border border-[#E5E2DC] overflow-hidden divide-y divide-[#E5E2DC]">
                      {recommendations.slice(0, 5).map((rec, i) => (
                        <RecCard key={rec.id} rec={rec} index={i} />
                      ))}
                    </div>
                    <ViewAllRecsButton />
                  </div>
                </div>
              )}

              {/* Competitive ranking */}
              {quadrantPoints.length > 1 && rankingTotal > 0 && (
                <div className="flex gap-8 fade-up fade-up-2">
                  <div className="w-1/4 shrink-0 pt-1 space-y-1.5">
                    <h2 className="tracking-tight text-[#141414]" style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600, fontSize: '1.5rem' }}>Competitive Ranking</h2>
                    <p className="text-xs text-[#ABABAB] leading-relaxed">How your mention rate compares to key competitors in brand-agnostic queries.</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <CompetitorQuadrant points={quadrantPoints} totalProbes={rankingTotal} />
                  </div>
                </div>
              )}

              {/* Top Voices */}
              {sourceGapResult.hasAnyData && (
                <div className="flex gap-8 fade-up fade-up-3">
                  <div className="w-1/4 shrink-0 pt-1 space-y-1.5">
                    <h2 className="tracking-tight text-[#141414]" style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600, fontSize: '1.5rem' }}>Influential Voices</h2>
                    <p className="text-xs text-[#ABABAB] leading-relaxed">The sources AI models cite most when responding to queries in your category.</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <InfluentialPublications entries={
                      (Object.values(sourceGapResult.byType) as import('@/lib/analysis/source-gaps').DomainEntry[][])
                        .flat()
                        .sort((a, b) => b.citedInProbeCount - a.citedInProbeCount)
                    } />
                  </div>
                </div>
              )}

              {/* Insights */}
              {insights.salienceTotal > 0 && (
                <div className="flex gap-8 fade-up fade-up-4">
                  <div className="w-1/4 shrink-0 pt-1 space-y-1.5">
                    <h2 className="tracking-tight text-[#141414]" style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600, fontSize: '1.5rem' }}>Insights</h2>
                    <p className="text-xs text-[#ABABAB] leading-relaxed">Patterns in how AI models understand and represent your brand.</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <InsightsSection
                      insights={insights}
                      companyName={report.company_name ?? new URL(report.url).hostname}
                      description={report.inference_json?.canonical_description}
                    />
                  </div>
                </div>
              )}
            </div>
          }
          prompts={
            probes.length > 0 ? (
              <ProbeExplorer
                probes={probes}
                companyName={report.company_name ?? ''}
                platformSummaries={report.inference_json?.platform_summaries ?? {}}
              />
            ) : (
              <p className="text-sm text-[#ABABAB]">No probe data available.</p>
            )
          }
          citations={
            sourceGapResult.hasAnyData ? (
              <SourceGapAnalysis
                result={sourceGapResult}
                companyName={report.company_name ?? new URL(report.url).hostname}
              />
            ) : (
              <p className="text-sm text-[#ABABAB]">No citation data available.</p>
            )
          }
        />
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


function RecCard({ rec, index }: { rec: Recommendation; index: number }) {
  return (
    <div className="flex items-center gap-4 bg-[#ffffff] px-5 py-3">
      <span className="score-number text-xl text-[#CDCBC6] shrink-0">{index + 1}</span>
      <p className="flex-1 min-w-0 text-sm text-[#141414]">{rec.title}</p>
    </div>
  )
}

