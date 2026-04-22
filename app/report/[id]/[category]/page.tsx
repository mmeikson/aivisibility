import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getReport, getScoresByReport, getRecommendationsByReport, getProbesByReport } from '@/lib/db/queries'
import { RecommendationCard } from '@/components/recommendation-card'
import type { ScoreCategory } from '@/lib/db/types'
import { severityLabel, severityClass } from '@/lib/scoring/priority'
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, COMPONENT_MAX } from '@/lib/constants'

interface Props {
  params: Promise<{ id: string; category: string }>
}

const VALID_CATEGORIES: ScoreCategory[] = ['category_association', 'retrieval', 'entity', 'social_proof']

const COMPONENT_LABELS: Record<string, string> = {
  // category_association
  discovery_mention_rate: 'Discovery mention rate',
  avg_mention_position: 'Avg. mention position',
  competitor_gap: 'Competitor gap',
  cross_platform_consistency: 'Cross-platform consistency',
  // retrieval
  mention_rate: 'Mention rate',
  direct_url_citation: 'Direct URL citation',
  roundup_presence: 'Roundup presence',
  content_format: 'Content format',
  // entity
  schema_markup: 'Schema markup',
  description_specificity: 'Description specificity',
  profile_completeness: 'Profile completeness',
  wikipedia: 'Wikipedia presence',
  description_consistency: 'Description consistency',
  // social_proof — saas
  g2_presence: 'G2 presence',
  capterra_presence: 'Capterra presence',
  product_hunt: 'Product Hunt',
  // social_proof — consumer
  amazon_reviews: 'Amazon reviews',
  trustpilot_presence: 'Trustpilot presence',
  youtube_reviews: 'YouTube reviews',
  // social_proof — health_wellness
  editorial_mentions: 'Editorial mentions',
  // social_proof — fintech
  app_reviews: 'App store reviews',
  // social_proof — shared
  reddit_mentions: 'Reddit mentions',
  listicle_appearances: 'Listicle appearances',
}

const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

export default async function CategoryPage({ params }: Props) {
  const { id, category } = await params

  if (!VALID_CATEGORIES.includes(category as ScoreCategory)) notFound()
  const cat = category as ScoreCategory

  const report = await getReport(id)
  if (!report) redirect('/')
  if (report.status !== 'complete') redirect(`/report/${id}/loading`)

  const [scores, allRecs, probes] = await Promise.all([
    getScoresByReport(id),
    getRecommendationsByReport(id),
    cat === 'entity' ? getProbesByReport(id) : Promise.resolve([]),
  ])

  const score = scores.find((s) => s.category === cat)
  if (!score) notFound()

  const recs = allRecs
    .filter((r) => r.type === cat)
    .sort((a, b) => {
      const ea = EFFORT_ORDER[a.effort?.toLowerCase() ?? 'medium'] ?? 1
      const eb = EFFORT_ORDER[b.effort?.toLowerCase() ?? 'medium'] ?? 1
      return ea - eb || b.priority - a.priority
    })

  const components = Object.entries(score.component_scores_json)

  const confusedProbes = probes.filter(p => p.parsed_json?.entity_confused)
  const confusedWith = [...new Set(
    confusedProbes.map(p => p.parsed_json?.confused_with).filter(Boolean) as string[]
  )]
  const probeCount = probes.filter(p => p.status === 'complete').length

  return (
    <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
      {/* Top bar */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
        <Link
          href={`/report/${id}`}
          className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase hover:text-[#141414] transition-colors"
        >
          ← {report.company_name ?? 'Report'}
        </Link>
        <span className="text-xs text-[#6C6C6C]">Beta</span>
      </header>

      <div className="flex-1 px-6 py-12 max-w-[1024px] mx-auto w-full space-y-12">

        {/* Category header */}
        <div className="flex items-end justify-between gap-4 fade-up">
          <div className="space-y-1.5">
            <p className="text-xs font-mono text-[#ABABAB] tracking-widest uppercase">
              {CATEGORY_LABELS[cat]}
            </p>
            <p className="text-sm text-[#6C6C6C] leading-relaxed max-w-lg">
              {CATEGORY_DESCRIPTIONS[cat]}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className={`score-number text-5xl ${severityClass(score.raw_score)}`}>
              {score.raw_score}
            </div>
            <div className={`text-xs font-mono mt-0.5 ${severityClass(score.raw_score)}`}>
              {severityLabel(score.raw_score)}
            </div>
          </div>
        </div>

        {/* Disambiguation notice — entity only */}
        {cat === 'entity' && confusedProbes.length > 0 && (
          <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 fade-up fade-up-1">
            <p className="text-xs text-[#92400e] leading-relaxed">
              ⚠ {confusedProbes.length} of {probeCount} responses described a different entity
              {confusedWith.length > 0 && <> ({confusedWith.join(', ')})</>}.
              {' '}AI models may be conflating your brand with another, which directly penalises your entity score.
            </p>
          </div>
        )}

        {/* Score breakdown */}
        <div className="space-y-3 fade-up fade-up-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Score Breakdown</span>
            <span className="flex-1 h-px bg-[#E5E2DC]" />
          </div>

          <div className="rounded-lg border border-[#E5E2DC] bg-white overflow-hidden">
            {components.map(([key, value], i) => {
              const max = COMPONENT_MAX[key] ?? 20
              const pct = Math.round((value / max) * 100)
              const label = COMPONENT_LABELS[key] ?? key.replace(/_/g, ' ')
              return (
                <div
                  key={key}
                  className={`flex items-center gap-4 px-5 py-3.5 ${i < components.length - 1 ? 'border-b border-[#E5E2DC]' : ''}`}
                >
                  <span className="text-sm text-[#141414] flex-1">{label}</span>
                  <div className="w-28 h-1 bg-[#F3F2EF] rounded-full overflow-hidden shrink-0">
                    <div
                      className={`h-full rounded-full ${
                        pct >= 80 ? 'severity-bar-healthy' :
                        pct >= 60 ? 'severity-bar-moderate' :
                        pct >= 40 ? 'severity-bar-weak' : 'severity-bar-critical'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono text-[#6C6C6C] w-12 text-right shrink-0">
                    {value}<span className="text-[#ABABAB">/{max}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recommendations */}
        {recs.length > 0 && (
          <div className="space-y-4 fade-up fade-up-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">Recommendations</span>
              <span className="flex-1 h-px bg-[#E5E2DC]" />
            </div>

            <div className="space-y-4">
              {recs.map((rec, i) => (
                <RecommendationCard key={rec.id} rec={rec} index={i} />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-[#E5E2DC] flex items-center justify-between">
        <Link href={`/report/${id}`} className="text-xs text-[#ABABAB] hover:text-[#6C6C6C] transition-colors">
          ← Back to report
        </Link>
        <span className="text-xs text-[#ABABAB] font-mono">v1</span>
      </footer>
    </main>
  )
}

