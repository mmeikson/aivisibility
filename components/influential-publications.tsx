'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import type { DomainEntry } from '@/lib/analysis/source-gaps'

interface Props {
  entries: DomainEntry[]
}

// Greedy packing: for each circle, find the closest position to the origin
// that doesn't overlap any already-placed circle.
function packCircles(radii: number[], gap = 10): { x: number; y: number }[] {
  type C = { x: number; y: number; r: number }
  const placed: C[] = []

  for (const r of radii) {
    if (placed.length === 0) {
      placed.push({ x: 0, y: 0, r })
      continue
    }

    const maxR = Math.max(...placed.map(c => Math.hypot(c.x, c.y) + c.r)) + r * 2 + gap * 2
    let found = false

    outer: for (let ri = 0; ri <= maxR; ri += 3) {
      for (let ai = 0; ai < 360; ai += 3) {
        const angle = (ai * Math.PI) / 180
        const x = ri * Math.cos(angle)
        const y = ri * Math.sin(angle)
        if (placed.every(c => Math.hypot(x - c.x, y - c.y) >= c.r + r + gap)) {
          placed.push({ x, y, r })
          found = true
          break outer
        }
      }
    }

    if (!found) placed.push({ x: 0, y: placed.length * 300, r })
  }

  return placed.map(({ x, y }) => ({ x, y }))
}

function BubbleModal({ entry, onClose }: { entry: DomainEntry; onClose: () => void }) {
  const urls = entry.sampleUrls.length > 0 ? entry.sampleUrls : [`https://${entry.domain}`]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-[#141414]/40 backdrop-blur-[2px]" />
      <div
        className="relative bg-[#ffffff] rounded-xl border border-[#E5E2DC] shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E5E2DC]">
          <Image
            src={`https://www.google.com/s2/favicons?domain=${entry.domain}&sz=16`}
            alt="" width={16} height={16} className="rounded-sm shrink-0" unoptimized
          />
          <span className="font-mono text-sm font-medium text-[#141414] flex-1 min-w-0 truncate">
            {entry.domain}
          </span>
          <span className="text-xs font-mono text-[#ABABAB] shrink-0">
            {entry.citedInProbeCount} {entry.citedInProbeCount === 1 ? 'cite' : 'cites'}
          </span>
          <button
            onClick={onClose}
            className="shrink-0 text-[#ABABAB] hover:text-[#141414] transition-colors text-lg leading-none ml-1"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
          {urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs font-mono text-[#6C6C6C] hover:text-[#141414] hover:underline break-all transition-colors"
            >
              {url.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export function InfluentialPublications({ entries }: Props) {
  const [selected, setSelected] = useState<DomainEntry | null>(null)

  if (entries.length === 0) return null

  const top = entries.slice(0, 15)
  const maxCount = Math.max(...top.map((e) => e.citedInProbeCount))
  const minCount = Math.min(...top.map((e) => e.citedInProbeCount))

  const MIN_DIAM = 64
  const MAX_DIAM = 160

  function getDiameter(count: number): number {
    if (maxCount === minCount) return (MIN_DIAM + MAX_DIAM) / 2
    const t = (count - minCount) / (maxCount - minCount)
    return Math.round(MIN_DIAM + (MAX_DIAM - MIN_DIAM) * Math.sqrt(t))
  }

  const diameters = top.map((e) => getDiameter(e.citedInProbeCount))
  const radii = diameters.map((d) => d / 2)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const positions = useMemo(() => packCircles(radii), [radii.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  // Compute bounding box and center everything in the container
  const PAD = 12
  const minX = Math.min(...positions.map((p, i) => p.x - radii[i]))
  const minY = Math.min(...positions.map((p, i) => p.y - radii[i]))
  const maxX = Math.max(...positions.map((p, i) => p.x + radii[i]))
  const maxY = Math.max(...positions.map((p, i) => p.y + radii[i]))
  const width = maxX - minX + PAD * 2
  const height = maxY - minY + PAD * 2

  return (
    <>
      <div className="w-full overflow-x-auto rounded-lg border border-[#E5E2DC]" style={{ backgroundColor: '#f3f2ef' }}>
        <div className="relative mx-auto" style={{ width, height }}>
          {top.map((entry, i) => {
            const diam = diameters[i]
            const { x, y } = positions[i]
            const left = x - minX + PAD - radii[i]
            const top_ = y - minY + PAD - radii[i]
            const isLarge = diam >= 100
            const isMed = diam >= 80

            return (
              <button
                key={entry.domain}
                onClick={() => setSelected(entry)}
                title={entry.domain}
                className={[
                  'absolute rounded-full flex flex-col items-center justify-center transition-all cursor-pointer',
                  'bg-[#ffffff] border hover:shadow-lg hover:scale-105',
                  entry.isGap ? 'border-[#CEAC01]' : 'border-[#E5E2DC] hover:border-[#141414]',
                ].join(' ')}
                style={{ width: diam, height: diam, left: left, top: top_ }}
              >
                <Image
                  src={`https://www.google.com/s2/favicons?domain=${entry.domain}&sz=16`}
                  alt="" width={isLarge ? 16 : 12} height={isLarge ? 16 : 12}
                  className="rounded-sm shrink-0 mb-1" unoptimized
                />
                {isMed && (
                  <span
                    className="text-[12px] font-mono text-[#141414] leading-tight text-center px-2 w-full"
                    style={{
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {entry.domain.replace(/^www\./, '')}
                  </span>
                )}
                <span className="text-[11px] font-mono text-[#ABABAB] mt-0.5">
                  {entry.citedInProbeCount}
                </span>
              </button>
            )
          })}
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('percelo:switch-tab', { detail: 'citations' }))}
            className="text-xs font-mono text-[#ABABAB] hover:text-[#141414] transition-colors underline underline-offset-2"
          >
            View all {entries.length} citations →
          </button>
        </div>
      </div>

      {selected && (
        <BubbleModal entry={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
