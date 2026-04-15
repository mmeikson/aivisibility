import type { InferenceResult, Probe } from '@/lib/db/types'

// Entity Recognition Score (0–100)
// Measures how consistently the brand is described across surfaces an LLM would
// encounter during training. For MVP, we use web search proxies via SerpAPI.

interface SerpResult {
  organic_results?: Array<{ link?: string; snippet?: string; title?: string }>
}

async function serpSearch(query: string): Promise<SerpResult> {
  const key = process.env.SERP_API_KEY
  if (!key) return {}
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&num=5`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return {}
  return res.json()
}

function domainPresent(results: SerpResult, domain: string): boolean {
  return (results.organic_results ?? []).some(
    (r) => r.link?.toLowerCase().includes(domain.toLowerCase())
  )
}

export async function scoreEntity(
  inference: InferenceResult,
  crawledHomepageHtml: string,
  probes: Probe[] = []
): Promise<{ raw_score: number; component_scores_json: Record<string, number> }> {

  // Component 1: AI knowledge (20 pts)
  // Measures what AI models correctly know about the brand from entity_check probes.
  // Confused probes (entity_confused=true) are excluded — a mention of the wrong entity
  // is not evidence that the AI knows this brand. Neutral default of 10 if no probes yet.
  const entityProbes = probes.filter((p) => p.prompt_type === 'entity_check' && p.parsed_json)
  const correctlyKnownCount = entityProbes.filter(
    (p) => p.parsed_json!.was_mentioned && !p.parsed_json!.entity_confused
  ).length
  const aiKnowledgeScore =
    entityProbes.length > 0 ? Math.round((correctlyKnownCount / entityProbes.length) * 20) : 10

  // Component 2: Profile completeness (15 pts) — presence on major B2B/discovery platforms
  const profileChecks = await Promise.allSettled([
    serpSearch(`${inference.company_name} site:g2.com`),
    serpSearch(`${inference.company_name} site:linkedin.com`),
    serpSearch(`${inference.company_name} site:crunchbase.com`),
    serpSearch(`${inference.company_name} site:capterra.com`),
  ])
  const profileDomains = ['g2.com', 'linkedin.com', 'crunchbase.com', 'capterra.com']
  const profileWeights = [4, 4, 4, 3] // sums to 15
  let profileScore = 0
  profileChecks.forEach((result, i) => {
    if (result.status === 'fulfilled' && domainPresent(result.value, profileDomains[i])) {
      profileScore += profileWeights[i]
    }
  })

  // Component 3: Wikipedia presence (10 pts)
  let wikipediaScore = 0
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(inference.company_name)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (wikiRes.ok) {
      const data = await wikiRes.json()
      if (data.type !== 'disambiguation' && data.extract) {
        wikipediaScore = 10
      }
    }
  } catch {
    // Wikipedia lookup failed — skip
  }

  // Component 4: Description consistency (25 pts)
  let consistencyScore = 10 // default mid-range
  try {
    const searchResults = await serpSearch(inference.company_name)
    const snippets = (searchResults.organic_results ?? [])
      .map((r) => `${r.title ?? ''} ${r.snippet ?? ''}`.toLowerCase())
      .join(' ')

    const categoryWords = inference.category.toLowerCase().split(' ')
    const matchCount = categoryWords.filter((w) => w.length > 3 && snippets.includes(w)).length
    const matchRatio = categoryWords.length > 0 ? matchCount / categoryWords.length : 0

    if (matchRatio >= 0.8) consistencyScore = 25
    else if (matchRatio >= 0.6) consistencyScore = 18
    else if (matchRatio >= 0.4) consistencyScore = 10
    else consistencyScore = 0
  } catch {
    // Keep default
  }

  // Component 5: Entity disambiguation (30 pts)
  // Measures how often AI models correctly identify the company vs. confusing it with another entity.
  // Thresholds are intentionally steep — any meaningful confusion rate is a serious visibility problem.
  // 0%        → 30  (clean)
  // (0–5%)    → 24  (minor / edge case)
  // [5–15%)   → 15  (moderate — noticeable brand ambiguity)
  // [15–30%)  → 6   (significant — AI regularly describes the wrong company)
  // ≥30%      → 0   (severe)
  let disambiguationScore = 30
  const parsedProbes = probes.filter((p) => p.parsed_json !== null)
  if (parsedProbes.length > 0) {
    const confusedCount = parsedProbes.filter((p) => p.parsed_json?.entity_confused).length
    const confusionRate = confusedCount / parsedProbes.length
    if (confusionRate >= 0.30) disambiguationScore = 0
    else if (confusionRate >= 0.15) disambiguationScore = 6
    else if (confusionRate >= 0.05) disambiguationScore = 15
    else if (confusionRate > 0) disambiguationScore = 24
    else disambiguationScore = 30
  }

  const raw_score = Math.min(
    100,
    aiKnowledgeScore + profileScore + wikipediaScore + consistencyScore + disambiguationScore
  )

  return {
    raw_score,
    component_scores_json: {
      ai_knowledge: aiKnowledgeScore,
      profile_completeness: profileScore,
      wikipedia_presence: wikipediaScore,
      description_consistency: consistencyScore,
      entity_disambiguation: disambiguationScore,
    },
  }
}
