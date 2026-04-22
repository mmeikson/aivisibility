import type { Probe, PromptType } from '@/lib/db/types'

export type ClusterKey = 'discovery' | 'comparison' | 'workflow'

export interface ClusterConfig {
  key: ClusterKey
  label: string
  promptTypes: PromptType[]
}

export interface DomainEntry {
  domain: string
  citedInProbeCount: number
  totalProbesInCluster: number
  citationRate: number
  brandMentionedCount: number
  competitorsMentioned: string[]
  isGap: boolean
}

export interface ClusterAnalysis {
  cluster: ClusterConfig
  totalProbes: number
  domains: DomainEntry[]
  hasData: boolean
  gapCount: number
}

export interface SourceGapResult {
  clusters: ClusterAnalysis[]
  hasAnyData: boolean
}

const CLUSTERS: ClusterConfig[] = [
  { key: 'discovery',  label: 'Discovery Queries',  promptTypes: ['discovery', 'ranking'] },
  { key: 'comparison', label: 'Comparison Queries',  promptTypes: ['comparison', 'pairwise'] },
  { key: 'workflow',   label: 'Workflow Queries',    promptTypes: ['job_to_be_done'] },
]

export function computeSourceGaps(probes: Probe[]): SourceGapResult {
  const eligibleProbes = probes.filter(
    (p) => p.parsed_json !== null && (p.parsed_json.cited_domains?.length ?? 0) > 0
  )

  const clusters: ClusterAnalysis[] = CLUSTERS.map((cluster) => {
    const clusterProbes = eligibleProbes.filter((p) =>
      (cluster.promptTypes as string[]).includes(p.prompt_type)
    )

    if (clusterProbes.length === 0) {
      return { cluster, totalProbes: 0, domains: [], hasData: false, gapCount: 0 }
    }

    // Map<domain, { probeIds, brandCount, competitorCasing }>
    const domainMap = new Map<string, {
      probeIds: Set<string>
      brandCount: number
      competitorCasing: Map<string, string> // lowercase key → first-seen display casing
    }>()

    for (const probe of clusterProbes) {
      const domains = new Set(probe.parsed_json!.cited_domains)
      for (const domain of domains) {
        if (!domainMap.has(domain)) {
          domainMap.set(domain, { probeIds: new Set(), brandCount: 0, competitorCasing: new Map() })
        }
        const entry = domainMap.get(domain)!
        entry.probeIds.add(probe.id)
        if (probe.parsed_json!.was_mentioned) entry.brandCount++
        for (const comp of probe.parsed_json!.competitor_mentions ?? []) {
          const key = comp.toLowerCase().trim()
          if (key && !entry.competitorCasing.has(key)) {
            entry.competitorCasing.set(key, comp.trim())
          }
        }
      }
    }

    const total = clusterProbes.length

    const domainEntries: DomainEntry[] = Array.from(domainMap.entries()).map(([domain, acc]) => {
      const citedInProbeCount = acc.probeIds.size
      const competitorsMentioned = Array.from(acc.competitorCasing.values())
      const isGap =
        citedInProbeCount >= 2 &&
        competitorsMentioned.length > 0 &&
        acc.brandCount === 0
      return {
        domain,
        citedInProbeCount,
        totalProbesInCluster: total,
        citationRate: citedInProbeCount / total,
        brandMentionedCount: acc.brandCount,
        competitorsMentioned,
        isGap,
      }
    })

    // Gaps first, then by citedInProbeCount desc; top 8
    domainEntries.sort((a, b) => {
      if (a.isGap !== b.isGap) return a.isGap ? -1 : 1
      return b.citedInProbeCount - a.citedInProbeCount
    })

    const domains = domainEntries.slice(0, 8)
    const gapCount = domains.filter((d) => d.isGap).length

    return { cluster, totalProbes: total, domains, hasData: true, gapCount }
  })

  const hasAnyData = clusters.some((c) => c.hasData)
  return { clusters, hasAnyData }
}
