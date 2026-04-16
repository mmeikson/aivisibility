'use client'

import { useState } from 'react'

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
  const [hovered, setHovered] = useState<string | null>(null)

  if (points.length === 0) return null

  const sorted = [...points].sort((a, b) => b.mentionRate - a.mentionRate)

  return (
    <div className="rounded-lg border border-[#E5E2DC] bg-white px-6 py-5 space-y-4">
      {/* Track */}
      <div className="relative h-8">
        {/* Base line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[#E5E2DC] -translate-y-1/2" />

        {/* Tick marks at 0%, 25%, 50%, 75%, 100% */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <div
            key={v}
            className="absolute top-1/2 w-px h-2 bg-[#E5E2DC] -translate-y-1/2"
            style={{ left: `${v * 100}%` }}
          />
        ))}

        {/* Brand chips */}
        {sorted.map((pt) => {
          const isHovered = hovered === pt.name
          return (
            <div
              key={pt.name}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${pt.mentionRate * 100}%`, zIndex: pt.isTarget ? 10 : isHovered ? 9 : 1 }}
              onMouseEnter={() => setHovered(pt.name)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#141414] text-white text-[10px] font-mono rounded px-2 py-1.5 whitespace-nowrap pointer-events-none z-20 space-y-0.5">
                  <div className="font-medium">{pt.name}</div>
                  <div className="text-[#ABABAB]">{pt.mentions}/{totalProbes} probes · {Math.round(pt.mentionRate * 100)}%</div>
                </div>
              )}

              {/* Chip */}
              <div className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap cursor-default transition-shadow
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
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[10px] font-mono text-[#ABABAB]">
        <span>0%</span>
        <span className="tracking-widest uppercase">Mention rate across {totalProbes} probes</span>
        <span>100%</span>
      </div>
    </div>
  )
}
