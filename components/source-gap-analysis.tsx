'use client'

import { useState } from 'react'
import type { DomainEntry, SourceGapResult, SourceType } from '@/lib/analysis/source-gaps'
import { DomainRow, DomainTableHeader } from '@/components/domain-row'

interface Props {
  result: SourceGapResult
  companyName: string
}

const FILTERS: { key: SourceType | 'all'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'review',    label: 'Review' },
  { key: 'brand',     label: 'Brand' },
  { key: 'unknown',   label: 'Unknown' },
]

export function SourceGapAnalysis({ result, companyName: _companyName }: Props) {
  const [activeFilter, setActiveFilter] = useState<SourceType | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!result.hasAnyData) return null

  const allEntries = (Object.values(result.byType) as DomainEntry[][])
    .flat()
    .sort((a, b) => b.citedInProbeCount - a.citedInProbeCount)

  const filteredEntries = activeFilter === 'all' ? allEntries : (result.byType[activeFilter] ?? [])

  const toggle = (domain: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(domain) ? next.delete(domain) : next.add(domain)
      return next
    })

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => {
          const entries = key === 'all' ? allEntries : (result.byType[key] ?? [])
          const count = entries.length
          const gapCount = entries.filter((e) => e.isGap).length
          const isActive = activeFilter === key
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                isActive
                  ? 'bg-[#141414] text-[#FAFAF8]'
                  : 'bg-[#F3F2EF] text-[#6C6C6C] hover:bg-[#222429] hover:text-[#141414]',
              ].join(' ')}
            >
              {label}
              <span className={`text-[11px] font-mono ${isActive ? 'text-[#ABABAB]' : 'text-[#ABABAB]'}`}>
                {count}
              </span>
              {gapCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#CEAC01] shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {filteredEntries.length === 0 ? (
        <div className="border border-[#E5E2DC] rounded-lg px-4 py-6 text-xs text-[#ABABAB] text-center">
          No sources in this category.
        </div>
      ) : (
        <div className="border border-[#E5E2DC] rounded-lg overflow-hidden bg-[#ffffff]">
          <DomainTableHeader />
          <div className="divide-y divide-[#E5E2DC]">
            {filteredEntries.map((entry) => (
              <DomainRow
                key={entry.domain}
                entry={entry}
                isExpanded={expanded.has(entry.domain)}
                onToggle={() => toggle(entry.domain)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
