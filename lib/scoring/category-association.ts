import type { Probe } from '@/lib/db/types'

// Category Association Score (0–100)
// Measures how reliably the brand surfaces in discovery prompts across platforms.

// Platform weights reflect approximate real-world market share among AI assistant users.
// ChatGPT dominates, so visibility there counts most toward the score.
const PLATFORM_WEIGHTS: Record<string, number> = {
  openai: 0.60,
  anthropic: 0.20,
  google: 0.12,
  perplexity: 0.08,
}

const SCORED_PLATFORMS = Object.keys(PLATFORM_WEIGHTS)

export function scoreCategoryAssociation(
  probes: Probe[],
  competitors: string[]
): { raw_score: number; component_scores_json: Record<string, number> } {
  const discovery = probes.filter((p) => p.prompt_type === 'discovery' && p.parsed_json)

  if (discovery.length === 0) {
    return { raw_score: 0, component_scores_json: {} }
  }

  // Component 1: Weighted mention rate (40 pts)
  // Each platform's mention rate is weighted by its market share, then normalized
  // for any platforms with no probes.
  let weightedMentionRate = 0
  let totalWeight = 0
  for (const plt of SCORED_PLATFORMS) {
    const pltProbes = discovery.filter((p) => p.platform === plt)
    if (pltProbes.length === 0) continue
    const rate = pltProbes.filter((p) => p.parsed_json!.was_mentioned).length / pltProbes.length
    const w = PLATFORM_WEIGHTS[plt]
    weightedMentionRate += rate * w
    totalWeight += w
  }
  const mentionRate = totalWeight > 0 ? weightedMentionRate / totalWeight : 0
  const mentionScore = Math.round(mentionRate * 40)

  // Component 2: Average list position when mentioned (20 pts)
  const mentioned = discovery.filter((p) => p.parsed_json!.was_mentioned)
  const listPositions = mentioned.flatMap((p) => p.parsed_json!.mention_positions)
  let positionScore = 0
  if (listPositions.length > 0) {
    const avgPos = listPositions.reduce((a, b) => a + b, 0) / listPositions.length
    // Position 1 = 20pts, Position 5 = 4pts, linear interpolation
    positionScore = Math.max(0, Math.round(20 - (avgPos - 1) * 4))
  } else if (mentioned.length > 0) {
    // Mentioned but not in a ranked list — give partial credit
    positionScore = 8
  }

  // Component 3: Competitor gap (20 pts)
  // Compare brand mention rate vs median competitor mention rate
  let competitorGapScore = 0
  if (competitors.length > 0) {
    const competitorRates = competitors.map((comp) => {
      const compMentions = discovery.filter((p) =>
        p.parsed_json!.competitor_mentions.some(
          (m) => m.toLowerCase().includes(comp.toLowerCase())
        )
      ).length
      return compMentions / discovery.length
    })
    competitorRates.sort((a, b) => a - b)
    const medianRate = competitorRates[Math.floor(competitorRates.length / 2)] ?? 0

    if (medianRate === 0) {
      competitorGapScore = mentionRate > 0 ? 20 : 10
    } else if (mentionRate >= medianRate) {
      competitorGapScore = 20
    } else if (mentionRate >= medianRate * 0.5) {
      competitorGapScore = Math.round(10 + (mentionRate / medianRate - 0.5) * 20)
    } else if (mentionRate >= medianRate * 0.25) {
      competitorGapScore = Math.round((mentionRate / (medianRate * 0.25)) * 5)
    }
  }

  // Component 4: Weighted platform coverage (20 pts)
  // Each platform contributes its weight × 20 pts if the brand was mentioned there.
  // A brand mentioned only on ChatGPT scores 12pts; mentioned everywhere scores 20pts.
  let platformScore = 0
  for (const plt of SCORED_PLATFORMS) {
    const hasMention = discovery.some((p) => p.platform === plt && p.parsed_json!.was_mentioned)
    if (hasMention) platformScore += PLATFORM_WEIGHTS[plt] * 20
  }
  platformScore = Math.round(platformScore)

  const raw_score = Math.min(100, mentionScore + positionScore + competitorGapScore + platformScore)

  return {
    raw_score,
    component_scores_json: {
      mention_rate: mentionScore,
      position: positionScore,
      competitor_gap: competitorGapScore,
      cross_platform: platformScore,
    },
  }
}
