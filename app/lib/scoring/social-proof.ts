import type { InferenceResult } from '@/lib/db/types'

// Social Proof Score (0–100)
// Measures the density and distribution of third-party signals about the brand.
// MVP: uses SerpAPI web search as a proxy for direct platform scraping.

interface SerpResult {
  organic_results?: Array<{ link?: string; snippet?: string; title?: string }>
}

async function serpSearch(query: string, num = 10): Promise<SerpResult> {
  const key = process.env.SERP_API_KEY
  if (!key) return {}
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&num=${num}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return {}
  return res.json()
}

function countDomainAppearances(results: SerpResult, domain: string): number {
  return (results.organic_results ?? []).filter((r) =>
    r.link?.toLowerCase().includes(domain.toLowerCase())
  ).length
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
  const brand = inference.company_name
  const category = inference.category
  const topCompetitor = inference.competitors[0] ?? ''

  const [
    g2Results,
    capResults,
    redditResults,
    listicleResults,
    phResults,
    competitorListicle,
  ] = await Promise.allSettled([
    serpSearch(`${brand} reviews site:g2.com`, 5),
    serpSearch(`${brand} reviews site:capterra.com`, 5),
    serpSearch(`${brand} site:reddit.com`, 10),
    serpSearch(`best ${category}`, 20),
    serpSearch(`${brand} site:producthunt.com`, 3),
    topCompetitor ? serpSearch(`best ${category} ${topCompetitor}`, 20) : Promise.resolve({}),
  ])

  // Component 1: G2 review volume (25 pts) — presence + snippet signal
  let g2Score = 0
  if (g2Results.status === 'fulfilled') {
    const count = countDomainAppearances(g2Results.value, 'g2.com')
    g2Score = count >= 2 ? 25 : count === 1 ? 15 : 0
  }

  // Component 2: Capterra review volume (15 pts)
  let capScore = 0
  if (capResults.status === 'fulfilled') {
    const count = countDomainAppearances(capResults.value, 'capterra.com')
    capScore = count >= 2 ? 15 : count === 1 ? 8 : 0
  }

  // Component 3: Reddit mention frequency (20 pts)
  let redditScore = 0
  if (redditResults.status === 'fulfilled') {
    const count = countDomainAppearances(redditResults.value, 'reddit.com')
    if (count >= 5) redditScore = 20
    else if (count >= 3) redditScore = 14
    else if (count >= 1) redditScore = 7
  }

  // Component 4: Listicle appearances (25 pts)
  // Score = (brand count / top competitor count) × 25, capped at 25
  let listicleScore = 0
  if (listicleResults.status === 'fulfilled') {
    const brandCount = countBrandMentions(listicleResults.value, brand)
    const compCount = topCompetitor && competitorListicle.status === 'fulfilled'
      ? countBrandMentions(competitorListicle.value, topCompetitor)
      : brandCount // fallback: treat brand as its own baseline

    if (compCount > 0) {
      listicleScore = Math.min(25, Math.round((brandCount / compCount) * 25))
    } else if (brandCount > 0) {
      listicleScore = 12 // present but no competitor baseline
    }
  }

  // Component 5: Product Hunt presence (15 pts)
  let phScore = 0
  if (phResults.status === 'fulfilled') {
    const found = countDomainAppearances(phResults.value, 'producthunt.com')
    phScore = found > 0 ? 10 : 0 // 10 = listed (can't easily get upvote count via search)
  }

  const raw_score = Math.min(100, g2Score + capScore + redditScore + listicleScore + phScore)

  return {
    raw_score,
    component_scores_json: {
      g2_presence: g2Score,
      capterra_presence: capScore,
      reddit_mentions: redditScore,
      listicle_appearances: listicleScore,
      product_hunt: phScore,
    },
  }
}
