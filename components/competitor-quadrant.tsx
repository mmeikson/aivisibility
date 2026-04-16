'use client'

export interface CompetitorPoint {
  name: string
  domain: string
  mentions: number       // raw count across eligible probes
  mentionRate: number    // 0–1
  strength: number       // unused, kept for interface compat
  isTarget: boolean
}

interface Props {
  points: CompetitorPoint[]
  totalProbes: number
}

export function CompetitorQuadrant({ points, totalProbes }: Props) {
  if (points.length === 0) return null

  const sorted = [...points].sort((a, b) => b.mentionRate - a.mentionRate)

  return (
    <div className="rounded-lg border border-[#E5E2DC] bg-white px-6 py-4 space-y-2.5">
      {sorted.map((pt) => (
        <div key={pt.name} className="flex items-center gap-3">
          {/* Brand chip */}
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap shrink-0 w-44
            ${pt.isTarget
              ? 'bg-[#141414] border-[#141414] text-white'
              : 'bg-white border-[#E5E2DC] text-[#6C6C6C]'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${pt.domain}&sz=16`}
              alt=""
              width={14}
              height={14}
              className="rounded-sm shrink-0"
            />
            <span className="truncate">{pt.name}</span>
          </div>

          {/* Bar */}
          <div className="flex-1 h-1.5 bg-[#F3F2EF] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${pt.isTarget ? 'bg-[#141414]' : 'bg-[#CDCBC6]'}`}
              style={{ width: `${pt.mentionRate * 100}%` }}
            />
          </div>

          {/* Percentage */}
          <span className="text-xs font-mono text-[#ABABAB] w-10 text-right shrink-0">
            {Math.round(pt.mentionRate * 100)}%
          </span>
        </div>
      ))}

      <p className="text-[10px] text-[#ABABAB] font-mono pt-1">
        Mention rate across {totalProbes} brand-agnostic probes · 4 platforms
      </p>
    </div>
  )
}
