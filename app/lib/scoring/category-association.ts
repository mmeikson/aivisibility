import type { Probe } from '@/lib/db/types'

// Category Association Score (0–100)
// Measures how reliably the brand surfaces in discovery prompts across platforms.

export function scoreCategoryAssociation(
  probes: Probe[],
  competitors: string[]
): { raw_score: number; component_scores_json: Record<string, number> } {
  const discovery = probes.filter((p) => p.prompt_type === 'discovery' && p.parsed_json)

  if (discovery.length === 0) {
    return { raw_score: 0, component_scores_json: {} }
  }

  // Component 1: Discovery prompt mention rate (40 pts)
  const mentioned = discovery.filter((p) => p.parsed_json!.was_mentioned)
  const mentionRate = mentioned.length / discovery.length
  const mentionScore = Math.round(mentionRate * 40)

  // Component 2: Average list position when mentioned (20 pts)
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

  // Component 4: Cross-platform consistency (20 pts)
  const platforms = ['openai', 'anthropic', 'perplexity', 'google']
  const platformsWithMention = platforms.filter((plt) =>
    discovery.some((p) => p.platform === plt && p.parsed_json!.was_mentioned)
  ).length
  const platformScore = platformsWithMention === 4 ? 20
    : platformsWithMention === 3 ? 15
    : platformsWithMention === 2 ? 8
    : 0

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
