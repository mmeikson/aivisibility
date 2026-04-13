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

  // Component 1: Schema markup (20 pts)
  const hasOrgSchema =
    crawledHomepageHtml.includes('"Organization"') ||
    crawledHomepageHtml.includes("'Organization'") ||
    crawledHomepageHtml.includes('schema.org/Organization')
  const schemaScore = hasOrgSchema ? 20 : 0

  // Component 2: Description specificity (10 pts) — use confidence from inference
  const descConfidence = inference.confidence?.canonical_description ?? 'medium'
  const specificityScore = descConfidence === 'high' ? 10 : descConfidence === 'medium' ? 5 : 0

  // Component 3: Profile completeness (20 pts) — 5pts per platform found via SerpAPI
  const profileChecks = await Promise.allSettled([
    serpSearch(`${inference.company_name} site:g2.com`),
    serpSearch(`${inference.company_name} site:linkedin.com`),
    serpSearch(`${inference.company_name} site:crunchbase.com`),
    serpSearch(`${inference.company_name} site:capterra.com`),
  ])
  const profileDomains = ['g2.com', 'linkedin.com', 'crunchbase.com', 'capterra.com']
  let profileScore = 0
  profileChecks.forEach((result, i) => {
    if (result.status === 'fulfilled' && domainPresent(result.value, profileDomains[i])) {
      profileScore += 5
    }
  })

  // Component 4: Wikipedia presence (10 pts)
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

  // Component 5: Description consistency (20 pts)
  let consistencyScore = 10 // default mid-range
  try {
    const searchResults = await serpSearch(inference.company_name)
    const snippets = (searchResults.organic_results ?? [])
      .map((r) => `${r.title ?? ''} ${r.snippet ?? ''}`.toLowerCase())
      .join(' ')

    const categoryWords = inference.category.toLowerCase().split(' ')
    const matchCount = categoryWords.filter((w) => w.length > 3 && snippets.includes(w)).length
    const matchRatio = categoryWords.length > 0 ? matchCount / categoryWords.length : 0

    if (matchRatio >= 0.8) consistencyScore = 20
    else if (matchRatio >= 0.6) consistencyScore = 14
    else if (matchRatio >= 0.4) consistencyScore = 8
    else consistencyScore = 0
  } catch {
    // Keep default
  }

  // Component 6: Entity disambiguation (20 pts)
  // Measures how often AI models correctly identify the company vs. confusing it with another entity
  let disambiguationScore = 20
  const parsedProbes = probes.filter((p) => p.parsed_json !== null)
  if (parsedProbes.length > 0) {
    const confusedCount = parsedProbes.filter((p) => p.parsed_json?.entity_confused).length
    const confusionRate = confusedCount / parsedProbes.length
    if (confusionRate >= 0.5) disambiguationScore = 0
    else if (confusionRate >= 0.25) disambiguationScore = 8
    else if (confusionRate > 0) disambiguationScore = 14
    else disambiguationScore = 20
  }

  const raw_score = Math.min(100, schemaScore + specificityScore + profileScore + wikipediaScore + consistencyScore + disambiguationScore)

  return {
    raw_score,
    component_scores_json: {
      schema_markup: schemaScore,
      description_specificity: specificityScore,
      profile_completeness: profileScore,
      wikipedia_presence: wikipediaScore,
      description_consistency: consistencyScore,
      entity_disambiguation: disambiguationScore,
    },
  }
}
