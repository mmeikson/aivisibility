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

  // Component 1: Mention rate on retrieval platforms (30 pts)
  const mentioned = retrievalProbes.filter((p) => p.parsed_json!.was_mentioned)
  const mentionRate = mentioned.length / retrievalProbes.length
  const mentionScore = Math.round(mentionRate * 30)

  // Component 2: Direct URL citation rate (30 pts)
  // A brand-owned URL being cited is the strongest retrieval signal
  const normalizedDomain = brandDomain.replace(/^www\./, '').toLowerCase()
  const withCitation = retrievalProbes.filter((p) =>
    (p.parsed_json!.cited_domains ?? []).some((d) =>
      d.replace(/^www\./, '').toLowerCase().includes(normalizedDomain)
    )
  )
  const citationRate = withCitation.length / retrievalProbes.length
  const citationScore = citationRate >= 0.5
    ? 30
    : Math.round(citationRate * 60)

  // Component 3: Roundup/listicle presence — approximated from response text
  // Check if brand appears in responses that list multiple competitors (i.e. roundup-style)
  const roundupProbes = retrievalProbes.filter((p) => {
    const competitors = p.parsed_json!.competitor_mentions.length
    return competitors >= 2 // response mentions multiple competitors = likely a roundup
  })
  const brandInRoundups = roundupProbes.filter((p) => p.parsed_json!.was_mentioned).length
  const roundupScore = roundupProbes.length > 0
    ? Math.round((brandInRoundups / roundupProbes.length) * 20)
    : 10 // neutral if no roundup data

  // Component 4: Content format match (20 pts)
  // Approximated: if brand is cited on retrieval platforms, it has relevant content
  const contentScore = citationRate >= 0.3 ? 20
    : citationRate > 0 ? 10
    : mentionRate > 0 ? 5
    : 0

  const raw_score = Math.min(100, mentionScore + citationScore + roundupScore + contentScore)

  return {
    raw_score,
    component_scores_json: {
      mention_rate: mentionScore,
      citation_rate: citationScore,
      roundup_presence: roundupScore,
      content_format: contentScore,
    },
  }
}
