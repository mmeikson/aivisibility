import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getReport, getScoresByReport, getRecommendationsByReport, getProbesByReport } from '@/lib/db/queries'
import { ProbeExplorer } from '@/components/probe-explorer'
import { CompetitorQuadrant, type CompetitorPoint } from '@/components/competitor-quadrant'
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

const CATEGORY_DESCRIPTIONS: Record<ScoreCategory, string> = {
  category_association: 'Whether AI models associate your brand with your product category and recommend you in discovery queries.',
  retrieval: 'Whether AI models with web search retrieve and cite your website when answering relevant queries.',
  entity: 'Whether AI models correctly identify your brand as a distinct entity and avoid confusing it with others.',
  social_proof: 'Whether third-party reviews, mentions, and endorsements reinforce your brand in AI training data.',
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
  } else if (overallScore >= 65) {
    const strong = catScore >= 70 ? 'solid category association' : 'growing presence'
    s1 = `${companyName} has ${strong} in the ${category} space, though there are meaningful gaps to close.`
  } else if (overallScore >= 45) {
    s1 = `${companyName} has moderate AI visibility in the ${category} category — AI engines mention it in some relevant queries but miss it in others.`
  } else {
    s1 = `${companyName} has limited AI visibility in the ${category} space, and AI engines rarely surface it in discovery or recommendation queries.`
  }

  // Sentence 2 — top opportunity (lowest-scoring weighted component)
  const COMPONENT_ACTIONS: Record<string, string> = {
    // category_association
    mention_rate: 'building more AI-indexed content in your category',
    discovery_mention_rate: 'building more AI-indexed content in your category',
    position: 'working toward top-of-list placement in AI recommendations',
    avg_mention_position: 'working toward top-of-list placement in AI recommendations',
    competitor_gap: 'closing the visibility gap against leading competitors',
    cross_platform: 'improving consistency across all AI platforms',
    cross_platform_consistency: 'improving consistency across all AI platforms',
    // retrieval
    roundup_presence: 'earning placement in category comparison and roundup articles',
    citation_rate: 'making your site a citable source for AI retrieval engines',
    direct_url_citation: 'making your site a citable source for AI retrieval engines',
    // entity
    schema_markup: 'adding structured data markup to your website',
    wikipedia: 'establishing a Wikipedia presence',
    profile_completeness: 'completing your brand profiles across key platforms',
    description_consistency: 'aligning how your brand is described across the web',
    description_specificity: 'sharpening your brand description across the web',
    // social proof
    g2_presence: 'building your G2 review profile',
    capterra_presence: 'establishing a Capterra presence',
    product_hunt: 'launching on Product Hunt',
    amazon_reviews: 'growing your Amazon review profile',
    trustpilot_presence: 'building Trustpilot reviews',
    reddit_mentions: 'building community presence on Reddit',
    listicle_appearances: 'getting featured in best-of category articles',
    editorial_mentions: 'earning coverage in editorial review publications',
    youtube_reviews: 'getting your product reviewed on YouTube',
    app_reviews: 'building your app store review presence',
  }

  // Find the component with the worst score relative to its max (using COMPONENT_MAX from the category page)
  const COMPONENT_MAX: Record<string, number> = {
    mention_rate: 30, discovery_mention_rate: 40, position: 20, avg_mention_position: 20,
    competitor_gap: 20, cross_platform: 20, cross_platform_consistency: 20,
    roundup_presence: 30, citation_rate: 10, direct_url_citation: 30,
    schema_markup: 20, wikipedia: 10, profile_completeness: 20,
    description_consistency: 40, description_specificity: 10,
    g2_presence: 25, capterra_presence: 15, product_hunt: 15,
    amazon_reviews: 30, trustpilot_presence: 20, reddit_mentions: 20,
    listicle_appearances: 25, editorial_mentions: 10, youtube_reviews: 5,
    app_reviews: 10,
  }

  let worstKey = ''
  let worstGap = -1
  for (const score of scores) {
    for (const [key, pts] of Object.entries(score.component_scores_json)) {
      const max = COMPONENT_MAX[key] ?? (key.includes('.') ? 20 : undefined)
      if (!max) continue
      const gap = max - pts
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

  // Disambiguation: collect all unique entities AI engines confused the brand with
  const confusedProbes = probes.filter(p => p.parsed_json?.entity_confused)
  const confusedWith = [...new Set(
    confusedProbes.map(p => p.parsed_json?.confused_with).filter(Boolean) as string[]
  )]

  // Competitor ranking: derive from brand-agnostic probes (discovery, job_to_be_done, ranking)
  const rankingProbes = probes.filter(
    p => ['discovery', 'job_to_be_done', 'ranking'].includes(p.prompt_type) && p.parsed_json !== null
  )
  const rankingTotal = rankingProbes.length

  const competitorPoints: CompetitorPoint[] = report.competitors.map((name) => {
    const mentioned = rankingProbes.filter(p =>
      p.parsed_json!.competitor_mentions.some(c => c.toLowerCase().includes(name.toLowerCase()))
    )
    const strength = rankingTotal > 0
      ? rankingProbes.reduce((sum, p) => {
          const found = p.parsed_json!.competitor_mentions.some(
            c => c.toLowerCase().includes(name.toLowerCase())
          )
          if (!found) return sum
          const s = p.parsed_json!.recommendation_strength
          return sum + (s === 'confident' ? 1 : s === 'hedged' ? 0.5 : 0)
        }, 0) / rankingTotal
      : 0
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

  // All 4 scores in display order
  const SCORE_ORDER: ScoreCategory[] = ['category_association', 'retrieval', 'social_proof', 'entity']
  const orderedScores = SCORE_ORDER.flatMap(cat => scores.filter(s => s.category === cat))

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
          <div className="max-w-[1024px] mx-auto flex items-center justify-between gap-4">
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



      <div className="flex-1 px-6 py-12 max-w-[1024px] mx-auto w-full">

        {/* Report header */}
        <div className="space-y-4 mb-12 fade-up">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-[#ABABAB] tracking-widest uppercase">
                AI Visibility Report
              </div>
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

          {/* AI perception callout */}
          {report.inference_json?.canonical_description && (
            <div className="rounded-md border border-[#E5E2DC] bg-[#F7F6F3] px-4 py-3 space-y-1">
              <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">How AI currently perceives your brand</p>
              <p className="text-sm text-[#6C6C6C] leading-relaxed">&ldquo;{report.inference_json.canonical_description}&rdquo;</p>
              <p className="text-[11px] text-[#ABABAB]">This perception is inferred from your website and drives all probes and scoring. If it&rsquo;s off, your website content is likely sending mixed signals to AI models.</p>
            </div>
          )}

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

          {/* Summary + score row */}
          {scores.length > 0 && report.category && (
            <div className="flex items-start gap-8 pt-6 border-t border-[#E5E2DC]">
              <p
                className={`flex-1 text-2xl leading-snug ${severityClass(overallScore)}`}
                style={{ fontFamily: 'var(--font-geist-sans)' }}
              >
                {buildSummary(report.company_name ?? new URL(report.url).hostname, report.category, overallScore, scores)}
              </p>
              <div className="shrink-0 text-right">
                <div className={`score-number text-5xl ${severityClass(overallScore)}`}>{overallScore}</div>
                <div className="text-xs text-[#ABABAB] mt-0.5">{severityLabel(overallScore)} overall</div>
              </div>
            </div>
          )}
        </div>

        {/* Engine-first probe view */}
        {probes.length > 0 && (
          <div className="space-y-4 fade-up fade-up-1 mb-12">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Prompt Analysis</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>
            <ProbeExplorer
              probes={probes}
              companyName={report.company_name ?? ''}
              platformSummaries={report.inference_json?.platform_summaries ?? {}}
            />
          </div>
        )}

        {/* Score cards — all 4 categories */}
        {orderedScores.length > 0 && (
          <div className="space-y-4 fade-up fade-up-2 mb-12">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Scores</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {orderedScores.map((score) => (
                <FoundationCard
                  key={score.id}
                  score={score}
                  reportId={id}
                  disambig={score.category === 'entity' && confusedProbes.length > 0
                    ? { count: confusedProbes.length, total: probeCount, names: confusedWith }
                    : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Competitive ranking */}
        {quadrantPoints.length > 1 && rankingTotal > 0 && (
          <div className="space-y-4 fade-up fade-up-3 mb-12">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Competitive Ranking</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>
            <CompetitorQuadrant points={quadrantPoints} totalProbes={rankingTotal} />
          </div>
        )}

        {/* What to improve */}
        {recommendations.length > 0 && (
          <div className="space-y-4 fade-up fade-up-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">What to improve</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>
            <div className="rounded-lg border border-[#E5E2DC] overflow-hidden divide-y divide-[#E5E2DC]">
              {recommendations.map((rec, i) => (
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

function FoundationCard({ score, reportId, disambig }: {
  score: Score
  reportId: string
  disambig?: { count: number; total: number; names: string[] }
}) {
  const cat = score.category as ScoreCategory
  const label = CATEGORY_LABELS[cat] ?? cat
  const description = CATEGORY_DESCRIPTIONS[cat]
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
      {description && (
        <p className="text-xs text-[#ABABAB] leading-relaxed mb-3">{description}</p>
      )}
      {disambig && (
        <p className="text-xs text-[#92400e] bg-[#fffbeb] border border-[#fde68a] rounded px-2 py-1.5 mb-3 leading-relaxed">
          ⚠ {disambig.count} of {disambig.total} responses described a different entity
          {disambig.names.length > 0 && <> ({disambig.names.join(', ')})</>}
        </p>
      )}
      <span className="inline-flex items-center gap-1 text-xs text-[#141414] font-medium group-hover:gap-2 transition-all">
        See recommendations <span>→</span>
      </span>
    </Link>
  )
}

function RecCard({ rec, reportId, index }: { rec: Recommendation; reportId: string; index: number }) {
  return (
    <Link
      href={`/report/${reportId}/${rec.type}`}
      className="flex items-center gap-4 bg-white px-5 py-3 hover:bg-[#F7F6F3] transition-colors"
    >
      <span className="score-number text-xl text-[#CDCBC6] shrink-0">{index + 1}</span>
      <p className="flex-1 min-w-0 text-sm text-[#141414]">{rec.title}</p>
      <span className="shrink-0 text-xs text-[#6C6C6C] font-mono">→</span>
    </Link>
  )
}
