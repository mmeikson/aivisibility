import type { InferenceResult } from '@/lib/db/types'

// Social Proof Score (0–100)
// Two targeted searches: listicle presence and direct review presence.
// Requires SERP_API_KEY — returns 0 for both components when missing.

interface SerpResult {
  organic_results?: Array<{ link?: string; snippet?: string; title?: string }>
}

async function serpSearch(query: string, num = 10): Promise<SerpResult> {
  const key = process.env.SERP_API_KEY
  if (!key) return {}
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&num=${num}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return {}
    return res.json()
  } catch {
    return {}
  }
}

function countBrandMentions(results: SerpResult, brandName: string): number {
  const brand = brandName.toLowerCase()
  return (results.organic_results ?? []).filter(
    (r) =>
      r.title?.toLowerCase().includes(brand) ||
      r.snippet?.toLowerCase().includes(brand)
  ).length
}

export async function scoreSocialProof(
  inference: InferenceResult
): Promise<{ raw_score: number; component_scores_json: Record<string, number> }> {
  const { company_name: brand, category } = inference

  const [listicleResult, reviewResult] = await Promise.allSettled([
    serpSearch(`best ${category}`, 20),
    serpSearch(`${brand} reviews`, 10),
  ])

  // Listicle appearances: how often does the brand appear when buyers compare options?
  let listicle_appearances = 0
  if (listicleResult.status === 'fulfilled') {
    const n = countBrandMentions(listicleResult.value, brand)
    listicle_appearances = n >= 5 ? 50 : n >= 3 ? 35 : n >= 1 ? 20 : 0
  }

  // Review presence: do third-party reviews exist for this brand?
  let review_presence = 0
  if (reviewResult.status === 'fulfilled') {
    const n = countBrandMentions(reviewResult.value, brand)
    review_presence = n >= 4 ? 50 : n >= 2 ? 30 : n >= 1 ? 15 : 0
  }

  const raw_score = Math.min(100, listicle_appearances + review_presence)

  return {
    raw_score,
    component_scores_json: { listicle_appearances, review_presence },
  }
}
