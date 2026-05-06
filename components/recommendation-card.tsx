import type { Recommendation } from '@/lib/db/types'

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
            <a href={`https://${t}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0066CC] hover:underline">
              {t}
            </a>
          </span>
        ))}
      </>
    )
  }
  if (isDomain(target)) {
    return (
      <a href={`https://${target}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0066CC] hover:underline">
        {target}
      </a>
    )
  }
  return <span className="font-medium text-[#6C6C6C]">{target}</span>
}

export function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  return (
    <div className={`rounded-lg border border-[#E5E2DC] bg-white overflow-hidden fade-up fade-up-${Math.min(index + 3, 5)}`}>
      {/* Card header */}
      <div className="px-5 py-4 border-b border-[#E5E2DC]">
        <div className="flex items-start gap-3">
          <span className="score-number text-xl text-[#CDCBC6] shrink-0 mt-0.5">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-[#141414]">{rec.title}</h3>
            </div>
            {rec.why_it_matters && (
              <p className="text-xs text-[#6C6C6C] leading-relaxed">{rec.why_it_matters}</p>
            )}
          </div>
        </div>
      </div>

      {/* Action steps */}
      {(rec.action_steps?.length > 0 || rec.actions.length > 0) && (
        <div className="px-5 py-4 space-y-2">
          <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">Action steps</p>
          <ol className="space-y-1.5">
            {rec.action_steps?.length > 0
              ? rec.action_steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[#141414] leading-relaxed">
                    <span className="font-mono text-[#ABABAB] shrink-0">{i + 1}.</span>
                    <span>{s.step}</span>
                  </li>
                ))
              : rec.actions.map((action, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[#141414] leading-relaxed">
                    <span className="font-mono text-[#ABABAB] shrink-0">{i + 1}.</span>
                    <span>{action}</span>
                  </li>
                ))}
          </ol>
        </div>
      )}
    </div>
  )
}
