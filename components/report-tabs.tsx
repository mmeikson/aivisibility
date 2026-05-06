'use client'

import { useState, useEffect } from 'react'
import type { Recommendation } from '@/lib/db/types'
import { RecommendationCard } from '@/components/recommendation-card'

type TabKey = 'overview' | 'prompts' | 'citations' | 'recommendations'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'citations', label: 'Citations' },
  { key: 'recommendations', label: 'Recommendations' },
]

interface Props {
  overview: React.ReactNode
  prompts: React.ReactNode
  citations: React.ReactNode
  recommendations: Recommendation[]
}

export function ReportTabs({ overview, prompts, citations, recommendations }: Props) {
  const [active, setActive] = useState<TabKey>('overview')

  useEffect(() => {
    const handler = (e: Event) => setActive((e as CustomEvent<TabKey>).detail)
    window.addEventListener('percelo:switch-tab', handler)
    return () => window.removeEventListener('percelo:switch-tab', handler)
  }, [])

  const content: Record<TabKey, React.ReactNode> = {
    overview,
    prompts,
    citations,
    recommendations: <RecommendationsTab recommendations={recommendations} />,
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-[#E5E2DC] mb-10">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              active === tab.key
                ? 'border-[#141414] text-[#141414]'
                : 'border-transparent text-[#6C6C6C] hover:text-[#141414]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div key={active}>{content[active]}</div>
    </div>
  )
}

function RecommendationsTab({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return <p className="text-sm text-[#ABABAB]">No recommendations available.</p>
  }

  return (
    <div className="space-y-4">
      {recommendations.map((rec, i) => (
        <RecommendationCard key={rec.id} rec={rec} index={i} />
      ))}
    </div>
  )
}
