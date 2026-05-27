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
  headerLeft: React.ReactNode
  headerRight?: React.ReactNode
}

export function ReportTabs({ overview, prompts, citations, recommendations, headerLeft, headerRight }: Props) {
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
      {/* Header row: left (identity + tabs) + right (donut + share) */}
      <div className="flex items-start justify-between gap-8 mb-8">
        <div className="flex-1 min-w-0">
          {headerLeft}
          {/* Tab bar */}
          <div className="inline-flex gap-1 bg-[#ffffff] border border-[#E5E2DC] rounded-lg p-1 mt-4">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={[
                  'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
                  active === tab.key
                    ? 'bg-[#E5E2DC] text-[#141414] shadow-sm'
                    : 'text-[#6C6C6C] hover:text-[#141414]',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {headerRight && (
          <div className="shrink-0">{headerRight}</div>
        )}
      </div>

      {/* Tab content — full width */}
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
