import type { Recommendation, ScoreCategory } from '@/lib/db/types'

const CATEGORY_ICONS: Record<ScoreCategory, React.ReactNode> = {
  category_association: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  retrieval: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  ),
  entity: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5L2 4v4c0 3 2.5 5.5 6 6.5 3.5-1 6-3.5 6-6.5V4L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  social_proof: (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.4l-3.6 1.9.7-4L2.2 5.7l4-.6L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  ),
}

function isDomain(s: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s.trim())
}

function TargetLabel({ target }: { target: string }) {
  const tokens = target.trim().split(/\s+/)
  if (tokens.every(isDomain)) {
    return (
      <>
        {tokens.map((t, i) => (
          <span key={t}>
            {i > 0 && ' '}
            <a href={`https://${t}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#141414] hover:underline">
              {t}
            </a>
          </span>
        ))}
      </>
    )
  }
  if (isDomain(target)) {
    return (
      <a href={`https://${target}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#141414] hover:underline">
        {target}
      </a>
    )
  }
  return <span className="font-medium text-[#6C6C6C]">{target}</span>
}

export function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const steps = rec.action_steps?.length > 0
    ? rec.action_steps.map((s) => s.step)
    : rec.actions

  return (
    <div className={`rounded-lg border border-[#E5E2DC] bg-[#ffffff] overflow-hidden fade-up fade-up-${Math.min(index + 3, 5)}`}>

      {/* Overview */}
      <div className="flex items-start gap-3 px-5 py-6">
        <span className="shrink-0 mt-0.5 text-[#6C6C6C]">
          {CATEGORY_ICONS[rec.type]}
        </span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[#141414]">{rec.title}</h3>
          {rec.why_it_matters && (
            <p className="text-xs text-[#6C6C6C] leading-relaxed">{rec.why_it_matters}</p>
          )}
        </div>
      </div>

      {/* Action steps */}
      {steps.length > 0 && (
        <div className="px-5 py-5 space-y-2 border-t border-[#E5E2DC] bg-[#FAFAF8]">
          <p className="text-[11px] font-mono text-[#ABABAB] uppercase tracking-widest">Action steps</p>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs text-[#141414] leading-relaxed">
                <span className="font-mono text-[#ABABAB] shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

    </div>
  )
}
