'use client'

import { useState } from 'react'

export interface CompetitorPoint {
  name: string
  domain: string
  mentions: number       // raw count across eligible probes
  mentionRate: number    // 0–1
  strength: number       // 0–1 weighted recommendation strength
  isTarget: boolean
}

interface Props {
  points: CompetitorPoint[]
  totalProbes: number
}

export function CompetitorQuadrant({ points, totalProbes }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (points.length === 0) return null

  // Midpoints for quadrant dividers — use median of the data so lines are meaningful
  const midStrength = 0.35
  const midMentionRate = 0.35

  // Map a value 0–1 to a percentage within the plot area (with padding)
  const PAD = 0.12
  const toX = (v: number) => `${(PAD + v * (1 - PAD * 2)) * 100}%`
  const toY = (v: number) => `${(PAD + (1 - v) * (1 - PAD * 2)) * 100}%` // inverted: high = top

  const midXPct = `${(PAD + midStrength * (1 - PAD * 2)) * 100}%`
  const midYPct = `${(PAD + (1 - midMentionRate) * (1 - PAD * 2)) * 100}%`

  // Sort so target brand renders last (on top)
  const sorted = [...points].sort((a, b) => (a.isTarget ? 1 : 0) - (b.isTarget ? 1 : 0))

  return (
    <div className="space-y-2">
      {/* Chart */}
      <div className="relative w-full bg-white border border-[#E5E2DC] rounded-lg overflow-hidden" style={{ paddingBottom: '56%' }}>
        <div className="absolute inset-0">

          {/* Quadrant background tints */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none opacity-[0.015]">
            <div className="bg-[#141414]" />
            <div className="bg-[#22c55e]" />
            <div className="bg-[#141414]" />
            <div className="bg-[#141414]" />
          </div>

          {/* Divider lines */}
          <div className="absolute top-0 bottom-0 border-l border-dashed border-[#E5E2DC]" style={{ left: midXPct }} />
          <div className="absolute left-0 right-0 border-t border-dashed border-[#E5E2DC]" style={{ top: midYPct }} />

          {/* Quadrant labels */}
          <span className="absolute text-[10px] font-mono text-[#22c55e] tracking-wide" style={{ right: '3%', top: '4%' }}>
            LEADERS
          </span>
          <span className="absolute text-[10px] font-mono text-[#CDCBC6] tracking-wide" style={{ left: '3%', top: '4%' }}>
            PRESENT
          </span>
          <span className="absolute text-[10px] font-mono text-[#CDCBC6] tracking-wide" style={{ right: '3%', bottom: '4%' }}>
            RISING
          </span>
          <span className="absolute text-[10px] font-mono text-[#CDCBC6] tracking-wide" style={{ left: '3%', bottom: '4%' }}>
            FRINGE
          </span>

          {/* Data points */}
          {sorted.map((pt) => {
            const isHovered = hovered === pt.name
            return (
              <div
                key={pt.name}
                className="absolute"
                style={{
                  left: toX(pt.strength),
                  top: toY(pt.mentionRate),
                  transform: 'translate(-50%, -50%)',
                  zIndex: pt.isTarget ? 10 : isHovered ? 9 : 1,
                }}
                onMouseEnter={() => setHovered(pt.name)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#141414] text-white text-[10px] font-mono rounded px-2 py-1.5 whitespace-nowrap pointer-events-none z-20 space-y-0.5">
                    <div className="font-medium">{pt.name}</div>
                    <div className="text-[#ABABAB]">{pt.mentions}/{totalProbes} probes · {Math.round(pt.strength * 100)}% strength</div>
                  </div>
                )}

                {/* Chip */}
                <div className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] whitespace-nowrap cursor-default transition-shadow
                  ${pt.isTarget
                    ? 'bg-[#141414] border-[#141414] text-white shadow-md'
                    : isHovered
                      ? 'bg-white border-[#141414]/30 text-[#141414] shadow-sm'
                      : 'bg-white border-[#E5E2DC] text-[#6C6C6C]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${pt.domain}&sz=16`}
                    alt=""
                    width={12}
                    height={12}
                    className="rounded-sm shrink-0"
                  />
                  <span className="max-w-[80px] truncate">{pt.name}</span>
                </div>
              </div>
            )
          })}

          {/* Axis labels */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="text-[10px] font-mono text-[#ABABAB] tracking-widest uppercase">Recommendation Strength →</span>
          </div>
          <div className="absolute left-2 top-0 bottom-0 flex items-center">
            <span className="text-[10px] font-mono text-[#ABABAB] tracking-widest uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              ← Mention Rate
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <p className="text-[10px] text-[#ABABAB] font-mono">
        Based on {totalProbes} brand-agnostic probes across 4 platforms. Strength = weighted confident/hedged recommendation rate.
      </p>
    </div>
  )
}
