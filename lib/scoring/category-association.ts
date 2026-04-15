import type { Probe } from '@/lib/db/types'

// Category Association Score (0–100)
// Measures how reliably the brand surfaces in discovery prompts across platforms.
// Split into two surface types: parametric (training-data-driven) and retrieval (live-web).

// Within-group weights derived from original market-share proportions.
// Parametric group: openai(0.60) + anthropic(0.20) → 0.75 / 0.25
// Retrieval group:  google(0.12) + perplexity(0.08) → 0.60 / 0.40
const PARAMETRIC_WEIGHTS: Record<string, number> = { openai: 0.75, anthropic: 0.25 }
const RETRIEVAL_WEIGHTS: Record<string, number> = { google: 0.60, perplexity: 0.40 }

function strengthWeight(strength: string): number {
  return strength === 'confident' ? 1.0 : strength === 'hedged' ? 0.5 : 0.0
}

function weightedStrengthRate(probes: Probe[], platformWeights: Record<string, number>): number {
  let weighted = 0
  let totalWeight = 0
  for (const [plt, w] of Object.entries(platformWeights)) {
    const pltProbes = probes.filter((p) => p.platform === plt)
    if (pltProbes.length === 0) continue
    const rate =
      pltProbes.reduce((sum, p) => sum + strengthWeight(p.parsed_json!.recommendation_strength), 0) /
      pltProbes.length
    weighted += rate * w
    totalWeight += w
  }
  return totalWeight > 0 ? weighted / totalWeight : 0
}

export function scoreCategoryAssociation(
  probes: Probe[],
  _competitors: string[]
): { raw_score: number; component_scores_json: Record<string, number> } {
  const discovery = probes.filter((p) => p.prompt_type === 'discovery' && p.parsed_json)

  if (discovery.length === 0) {
    return { raw_score: 0, component_scores_json: {} }
  }

  // Sub-score 1: Parametric surface (0–50)
  // How strongly is the brand present in training-data-driven responses (OpenAI, Anthropic)?
  const parametricRate = weightedStrengthRate(discovery, PARAMETRIC_WEIGHTS)
  const parametric_score = Math.round(parametricRate * 50)

  // Sub-score 2: Retrieval surface (0–50)
  // How strongly is the brand present in live-retrieval responses (Perplexity, Google)?
  const retrievalRate = weightedStrengthRate(discovery, RETRIEVAL_WEIGHTS)
  const retrieval_score = Math.round(retrievalRate * 50)

  // Component 3: Pairwise win rate (0–20)
  // Direct competitive displacement: brand wins head-to-head comparisons with confident recommendation
  const pairwise = probes.filter((p) => p.prompt_type === 'pairwise' && p.parsed_json)
  const wins = pairwise.filter(
    (p) => p.parsed_json!.was_mentioned && p.parsed_json!.recommendation_strength === 'confident'
  ).length
  const win_rate = pairwise.length > 0 ? Math.round((wins / pairwise.length) * 20) : 0

  const raw_score = Math.min(100, parametric_score + retrieval_score + win_rate)

  return {
    raw_score,
    component_scores_json: {
      parametric_score,
      retrieval_score,
      win_rate,
    },
  }
}
