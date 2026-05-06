import type { Probe } from '@/lib/db/types'

// Probes where the brand isn't named — true salience signal.
const SALIENCE_TYPES = new Set(['discovery', 'job_to_be_done'])

const PLATFORM_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  perplexity: 'Perplexity',
  anthropic: 'Claude',
  google: 'Gemini',
}

const PLATFORM_ORDER = ['openai', 'perplexity', 'anthropic', 'google']

export interface PlatformInsight {
  platform: string
  label: string
  mentioned: number
  total: number
  rate: number
}

export interface InsightData {
  // Salience: brand-agnostic probes (discovery + jtbd)
  salienceMentioned: number
  salienceTotal: number
  salienceRate: number // 0–1

  // Per-platform breakdown (salience probes, sorted best → worst)
  platforms: PlatformInsight[]

  // Recommendation strength among all probes where was_mentioned = true
  mentionedCount: number
  confident: number
  hedged: number

  // Top competitors co-mentioned in salience probes
  topCompetitors: Array<{ name: string; count: number }>

  // Entity confusion
  confusedCount: number
  confusedWith: string[]
}

export function computeInsights(probes: Probe[]): InsightData {
  const completed = probes.filter(p => p.status === 'complete' && p.parsed_json !== null)

  const salienceProbes = completed.filter(p => SALIENCE_TYPES.has(p.prompt_type))
  const salienceMentioned = salienceProbes.filter(p => p.parsed_json!.was_mentioned).length
  const salienceTotal = salienceProbes.length

  const platforms: PlatformInsight[] = PLATFORM_ORDER
    .map(platform => {
      const pp = salienceProbes.filter(p => p.platform === platform)
      if (pp.length === 0) return null
      const mentioned = pp.filter(p => p.parsed_json!.was_mentioned).length
      return {
        platform,
        label: PLATFORM_LABELS[platform] ?? platform,
        mentioned,
        total: pp.length,
        rate: mentioned / pp.length,
      }
    })
    .filter((p): p is PlatformInsight => p !== null)
    .sort((a, b) => b.rate - a.rate)

  // Strength only from brand-agnostic probes — named probes (comparison, entity_check)
  // always mention the brand and inflate the confident % artificially.
  const mentionedProbes = salienceProbes.filter(p => p.parsed_json!.was_mentioned)
  const confident = mentionedProbes.filter(p => p.parsed_json!.recommendation_strength === 'confident').length
  const hedged = mentionedProbes.filter(p => p.parsed_json!.recommendation_strength === 'hedged').length

  const competitorCounts = new Map<string, number>()
  for (const probe of salienceProbes) {
    for (const comp of probe.parsed_json!.competitor_mentions) {
      const key = comp.trim()
      if (key) competitorCounts.set(key, (competitorCounts.get(key) ?? 0) + 1)
    }
  }
  const topCompetitors = [...competitorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }))

  const confusedProbes = completed.filter(p => p.parsed_json!.entity_confused)
  const confusedWith = [...new Set(
    confusedProbes.map(p => p.parsed_json!.confused_with).filter(Boolean) as string[]
  )]

  return {
    salienceMentioned,
    salienceTotal,
    salienceRate: salienceTotal > 0 ? salienceMentioned / salienceTotal : 0,
    platforms,
    mentionedCount: mentionedProbes.length, // salience probes only
    confident,
    hedged,
    topCompetitors,
    confusedCount: confusedProbes.length,
    confusedWith,
  }
}
