import type { Probe } from '@/lib/db/types'

// Entity Recognition Score (0–100)
// Pure probe-based: measures how reliably AI models identify the brand correctly.
// Penalises reports where models confuse the brand with a different entity.

export function scoreEntity(
  probes: Probe[] = []
): { raw_score: number; component_scores_json: Record<string, number> } {
  const parsed = probes.filter((p) => p.parsed_json !== null)

  if (parsed.length === 0) {
    return { raw_score: 50, component_scores_json: { entity_disambiguation: 50 } }
  }

  const confusedCount = parsed.filter((p) => p.parsed_json?.entity_confused).length
  const confusionRate = confusedCount / parsed.length

  // Steep tiers — any meaningful confusion rate is a serious visibility problem
  let entity_disambiguation: number
  if (confusionRate >= 0.30)      entity_disambiguation = 0
  else if (confusionRate >= 0.15) entity_disambiguation = 20
  else if (confusionRate >= 0.05) entity_disambiguation = 50
  else if (confusionRate > 0)     entity_disambiguation = 80
  else                            entity_disambiguation = 100

  return {
    raw_score: entity_disambiguation,
    component_scores_json: { entity_disambiguation },
  }
}
