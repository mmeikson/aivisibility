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
  platformCount: number       // how many distinct platforms cite this domain in this cluster
  platformNames: string[]     // e.g. ['perplexity', 'google', 'openai_search']
  isHighConfidence: boolean   // platformCount >= 2
}

export type DeltaClass = 'durable' | 'web_only' | 'parametric_only' | 'absent'

export interface ClusterDelta {
  parametricMentionRate: number  // was_mentioned rate for 'openai' probes in cluster
  webMentionRate: number         // was_mentioned rate for 'openai_search' probes in cluster
  deltaClass: DeltaClass
  parametricCount: number
  webCount: number
}

export interface ClusterAnalysis {
  cluster: ClusterConfig
  totalProbes: number
  domains: DomainEntry[]
  hasData: boolean
  gapCount: number
  delta: ClusterDelta | null   // null if either platform has no probes in this cluster
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

function classifyDelta(parametric: number, web: number): DeltaClass {
  if (parametric < 0.4 && web < 0.4) return 'absent'
  if (web - parametric > 0.2) return 'web_only'
  if (parametric - web > 0.2) return 'parametric_only'
  return 'durable'
}

export function computeSourceGaps(probes: Probe[]): SourceGapResult {
  const eligibleProbes = probes.filter(
    (p) => p.parsed_json !== null && (p.parsed_json.cited_domains?.length ?? 0) > 0
  )

  const clusters: ClusterAnalysis[] = CLUSTERS.map((cluster) => {
    const clusterProbes = eligibleProbes.filter((p) =>
      (cluster.promptTypes as string[]).includes(p.prompt_type)
    )

    // Delta: compare openai (parametric) vs openai_search (web) mention rates
    // Uses all probes in this cluster regardless of citations
    const allClusterProbes = probes.filter((p) =>
      (cluster.promptTypes as string[]).includes(p.prompt_type) && p.parsed_json !== null
    )
    const parametricProbes = allClusterProbes.filter((p) => p.platform === 'openai')
    const webProbes = allClusterProbes.filter((p) => p.platform === 'openai_search')
    const delta: ClusterDelta | null =
      parametricProbes.length > 0 && webProbes.length > 0
        ? {
            parametricCount: parametricProbes.length,
            webCount: webProbes.length,
            parametricMentionRate: parametricProbes.filter((p) => p.parsed_json!.was_mentioned).length / parametricProbes.length,
            webMentionRate: webProbes.filter((p) => p.parsed_json!.was_mentioned).length / webProbes.length,
            deltaClass: classifyDelta(
              parametricProbes.filter((p) => p.parsed_json!.was_mentioned).length / parametricProbes.length,
              webProbes.filter((p) => p.parsed_json!.was_mentioned).length / webProbes.length
            ),
          }
        : null

    if (clusterProbes.length === 0) {
      return { cluster, totalProbes: 0, domains: [], hasData: false, gapCount: 0, delta }
    }

    // Map<domain, { probeIds, platformNames, brandCount, competitorCasing }>
    const domainMap = new Map<string, {
      probeIds: Set<string>
      platformNames: Set<string>
      brandCount: number
      competitorCasing: Map<string, string>
    }>()

    for (const probe of clusterProbes) {
      const domains = new Set(probe.parsed_json!.cited_domains)
      for (const domain of domains) {
        if (!domainMap.has(domain)) {
          domainMap.set(domain, { probeIds: new Set(), platformNames: new Set(), brandCount: 0, competitorCasing: new Map() })
        }
        const entry = domainMap.get(domain)!
        entry.probeIds.add(probe.id)
        entry.platformNames.add(probe.platform)
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
      const platformNames = Array.from(acc.platformNames)
      const platformCount = platformNames.length
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
        platformCount,
        platformNames,
        isHighConfidence: platformCount >= 2,
      }
    })

    // High-confidence gaps first, then other gaps, then non-gaps; by citedInProbeCount desc within each group
    domainEntries.sort((a, b) => {
      const aScore = a.isGap ? (a.isHighConfidence ? 2 : 1) : 0
      const bScore = b.isGap ? (b.isHighConfidence ? 2 : 1) : 0
      if (aScore !== bScore) return bScore - aScore
      return b.citedInProbeCount - a.citedInProbeCount
    })

    const domains = domainEntries.slice(0, 8)
    const gapCount = domains.filter((d) => d.isGap).length

    return { cluster, totalProbes: total, domains, hasData: true, gapCount, delta }
  })

  const hasAnyData = clusters.some((c) => c.hasData)
  return { clusters, hasAnyData }
}
