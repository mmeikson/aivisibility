import type { Probe } from '@/lib/db/types'

// Retrieval Score (0–100)
// Measures visibility on Perplexity and Google which use live web retrieval.

export function scoreRetrieval(
  probes: Probe[],
  brandDomain: string
): { raw_score: number; component_scores_json: Record<string, number> } {
  const retrievalProbes = probes.filter(
    (p) => (p.platform === 'perplexity' || p.platform === 'google') && p.parsed_json
  )

  if (retrievalProbes.length === 0) {
    return { raw_score: 0, component_scores_json: {} }
  }

  // Component 1: Mention rate on retrieval platforms (60 pts)
  // The primary signal: does retrieval-based AI mention the brand at all?
  const mentioned = retrievalProbes.filter((p) => p.parsed_json!.was_mentioned)
  const mentionRate = mentioned.length / retrievalProbes.length
  const mentionScore = Math.round(mentionRate * 60)

  // Component 2: Roundup/listicle presence (30 pts)
  // Brand appears in responses that compare multiple options (high-value moments)
  const roundupProbes = retrievalProbes.filter((p) =>
    p.parsed_json!.competitor_mentions.length >= 2
  )
  const brandInRoundups = roundupProbes.filter((p) => p.parsed_json!.was_mentioned).length
  const roundupScore = roundupProbes.length > 0
    ? Math.round((brandInRoundups / roundupProbes.length) * 30)
    : 15 // neutral if no roundup data

  // Component 3: Domain citation bonus (10 pts)
  // Brand's own domain cited as a source — positive signal but not required
  const normalizedDomain = brandDomain.replace(/^www\./, '').toLowerCase()
  const withCitation = retrievalProbes.filter((p) =>
    (p.parsed_json!.cited_domains ?? []).some((d) =>
      d.replace(/^www\./, '').toLowerCase().includes(normalizedDomain)
    )
  )
  const citationScore = withCitation.length > 0 ? 10 : 0

  const raw_score = Math.min(100, mentionScore + roundupScore + citationScore)

  return {
    raw_score,
    component_scores_json: {
      mention_rate: mentionScore,
      roundup_presence: roundupScore,
      citation_rate: citationScore,
    },
  }
}
