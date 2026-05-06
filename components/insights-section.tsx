import type { InsightData } from '@/lib/analysis/insights'
import { ConfusionDetail } from '@/components/confusion-detail'

const PLATFORM_ICONS: Record<string, string> = {
  openai: '/logos/ChatGPT-Logo.svg',
  perplexity: '/logos/Perplexity--Streamline-Simple-Icons.svg',
  anthropic: '/logos/claude-color.svg',
  google: '/logos/gemini-color.svg',
}

function pct(n: number, d: number) {
  if (d === 0) return '—'
  return Math.round((n / d) * 100) + '%'
}

function mentionRateColor(rate: number) {
  if (rate >= 0.7) return 'severity-healthy'
  if (rate >= 0.45) return 'severity-moderate'
  if (rate >= 0.2) return 'severity-weak'
  return 'severity-critical'
}

function mentionRateStroke(rate: number) {
  if (rate >= 0.7) return '#16a34a'
  if (rate >= 0.45) return '#8fa83d'
  if (rate >= 0.2) return '#CEAC01'
  return '#b91c1c'
}

interface Props {
  insights: InsightData
  companyName: string
  description?: string
}

export function InsightsSection({ insights, companyName, description }: Props) {
  const {
    salienceMentioned, salienceTotal, salienceRate,
    platforms, mentionedCount, confident, hedged,
    topCompetitors, confusedCount, confusedWith,
  } = insights

  const confidencePct = mentionedCount > 0 ? Math.round((confident / mentionedCount) * 100) : null
  const hedgedPct = mentionedCount > 0 ? Math.round((hedged / mentionedCount) * 100) : null

  return (
    <div className="space-y-5">
      {/* Top two cards: mention rate + per-platform, side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Mention rate + co-mentions */}
        {(() => {
          const r = 22
          const sw = 7
          const circ = 2 * Math.PI * r
          const filled = salienceRate * circ
          return (
            <div className="rounded-lg border border-[#E5E2DC] bg-white px-5 py-4 flex flex-col gap-4">
              <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">How often are you recommended?</p>
              {/* Donut */}
              <div className="flex flex-col items-center gap-1.5">
                <svg viewBox="0 0 64 64" width="72" height="72">
                  <circle cx="32" cy="32" r={r} fill="none" stroke="#E5E2DC" strokeWidth={sw} />
                  <circle
                    cx="32" cy="32" r={r} fill="none"
                    stroke={mentionRateStroke(salienceRate)}
                    strokeWidth={sw}
                    strokeDasharray={`${filled} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 32 32)"
                  />
                  <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
                    fontSize="13" fontWeight="600" fill="#141414"
                    fontFamily="var(--font-geist-sans)">
                    {Math.round(salienceRate * 100)}%
                  </text>
                </svg>
                <p className="text-[10px] text-[#6C6C6C] leading-relaxed text-center">
                  {companyName} appeared in <span className="font-medium text-[#141414]">{salienceMentioned} of {salienceTotal}</span> category-level queries.
                </p>
              </div>
              {/* Co-mentions stacked below */}
              {topCompetitors.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-[#E5E2DC] pt-3">
                  <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">Most co-mentioned with</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topCompetitors.map((c) => {
                      const domain = c.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
                      return (
                        <span key={c.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E5E2DC] bg-[#F7F6F3] text-xs text-[#141414]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="rounded-sm" />
                          {c.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Per-platform breakdown */}
        {platforms.length > 0 && (
          <div className="rounded-lg border border-[#E5E2DC] bg-white divide-y divide-[#E5E2DC] overflow-hidden">
            <p className="px-5 py-3 text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">
              Mention rate by platform
            </p>
            {platforms.map(p => (
              <div key={p.platform} className="flex items-center gap-4 px-5 py-3">
                <div className="flex items-center gap-2 w-28 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PLATFORM_ICONS[p.platform] ?? ''} alt={p.label} width={14} height={14} className="opacity-60" />
                  <span className="text-xs text-[#6C6C6C]">{p.label}</span>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-[#E5E2DC] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${p.rate >= 0.7 ? 'bg-[#1A7A4A]' : p.rate >= 0.45 ? 'bg-[#B07D2A]' : p.rate >= 0.2 ? 'bg-[#8A4A2A]' : 'bg-[#CC2020]'}`}
                    style={{ width: `${Math.round(p.rate * 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-mono w-10 text-right shrink-0 ${mentionRateColor(p.rate)}`}>
                  {p.mentioned}/{p.total}
                </span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Brand identity card */}
      {description && (
        <div className="rounded-lg border border-[#E5E2DC] bg-white px-5 py-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest mb-1.5">How we read your brand</p>
            <p className="text-sm text-[#141414] leading-relaxed">{description}</p>
          </div>
          <div className="border-t border-[#E5E2DC] pt-3 flex items-start gap-2">
            {confusedCount === 0 ? (
              <>
                <span className="mt-0.5 text-[#16a34a]">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" stroke="currentColor"/><path d="M4 7l2.5 2.5L10 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <p className="text-xs text-[#6C6C6C] leading-relaxed">
                  <span className="text-[#16a34a] font-medium">AI models consistently recognize {companyName}</span> — no entity confusion detected across probes.
                </p>
              </>
            ) : (
              <>
                <span className="mt-0.5 text-[#b91c1c]">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" stroke="currentColor"/><path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="7" cy="10" r="0.75" fill="currentColor"/></svg>
                </span>
                <span className="text-xs text-[#6C6C6C] leading-relaxed">
                  <span className="text-[#b91c1c] font-medium">{confusedCount} probe{confusedCount !== 1 ? 's' : ''} returned responses about a different entity</span> — AI models may be conflating {companyName} with another company.
                  {confusedWith.length > 0 && <ConfusionDetail names={confusedWith} />}
                </span>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
