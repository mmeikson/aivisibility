'use client'

import { useState } from 'react'
import type { DomainEntry } from '@/lib/analysis/source-gaps'
import { DomainRow, DomainTableHeader } from '@/components/domain-row'

interface Props {
  entries: DomainEntry[]
}

export function InfluentialPublications({ entries }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (domain: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(domain) ? next.delete(domain) : next.add(domain)
      return next
    })

  if (entries.length === 0) return null

  return (
    <div className="border border-[#E5E2DC] rounded-lg overflow-hidden bg-white">
      <DomainTableHeader />
      <div className="divide-y divide-[#F0EEE9]">
        {entries.slice(0, 10).map((entry) => (
          <DomainRow
            key={entry.domain}
            entry={entry}
            isExpanded={expanded.has(entry.domain)}
            onToggle={() => toggle(entry.domain)}
          />
        ))}
      </div>
    </div>
  )
}
