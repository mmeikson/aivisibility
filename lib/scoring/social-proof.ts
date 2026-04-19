import type { InferenceResult } from '@/lib/db/types'

// Social Proof Score (0–100)
// Phase 1: discover which review sites matter for this brand via SerpAPI
// Phase 2: check brand presence on each discovered site

interface SerpResult {
  organic_results?: Array<{ link?: string; snippet?: string; title?: string }>
}

async function serpSearch(query: string, num = 10): Promise<SerpResult> {
  const key = process.env.SERP_API_KEY
  if (!key) {
    console.warn('[social-proof] SERP_API_KEY not set — all social proof scores will be 0')
    return {}
  }
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&num=${num}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) {
    console.warn(`[social-proof] SerpAPI returned ${res.status} for query: ${query}`)
    return {}
  }
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

// Domains that are not review surfaces — excluded from discovery candidates
const BLOCKLIST = new Set([
  'twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'facebook.com',
  'pinterest.com', 'linkedin.com', 'snapchat.com',
  'wikipedia.org', 'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  'github.com', 'microsoft.com', 'apple.com',
])

function extractTopDomains(results: SerpResult[], brandDomain: string, competitors: string[], n: number): string[] {
  const competitorKeywords = competitors.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((k) => k.length > 3)
  const freq: Record<string, number> = {}
  for (const r of results) {
    for (const item of r.organic_results ?? []) {
      try {
        const domain = new URL(item.link ?? '').hostname.replace(/^www\./, '')
        const domainClean = domain.replace(/[^a-z0-9]/g, '')
        if (
          !BLOCKLIST.has(domain) &&
          !domain.includes(brandDomain) &&
          !competitorKeywords.some((kw) => domainClean.includes(kw))
        ) {
          freq[domain] = (freq[domain] ?? 0) + 1
        }
      } catch { /* skip malformed URLs */ }
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([domain]) => domain)
}

export async function scoreSocialProof(
  inference: InferenceResult
): Promise<{ raw_score: number; component_scores_json: Record<string, number> }> {
  const brand = inference.company_name
  const category = inference.category

  // Derive the brand's own domain to exclude from candidate list
  const brandDomain = brand.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Phase 1 — discover relevant review sites (2 parallel calls)
  // Both searches are brand-agnostic: we want to find which sites review and rank
  // tools in this category, not which sites mention this specific brand. Brand-specific
  // searches surface competitor product pages (which mention the brand as a rival),
  // not review sites.
  const [categoryReviewsResult, bestCategoryResult] = await Promise.allSettled([
    serpSearch(`${category} reviews`, 10),
    serpSearch(`best ${category}`, 20),
  ])

  const discoveryResults: SerpResult[] = []
  if (categoryReviewsResult.status === 'fulfilled') discoveryResults.push(categoryReviewsResult.value)
  if (bestCategoryResult.status === 'fulfilled') discoveryResults.push(bestCategoryResult.value)

  const topDomains = extractTopDomains(discoveryResults, brandDomain, inference.competitors ?? [], 5)

  // Phase 2 — check brand presence on each discovered site (parallel, up to 5 calls)
  const presenceResults = await Promise.allSettled(
    topDomains.map((domain) => serpSearch(`"${brand}" ${category} site:${domain}`, 5))
  )

  const component_scores_json: Record<string, number> = {}

  for (let i = 0; i < topDomains.length; i++) {
    const domain = topDomains[i]
    const result = presenceResults[i]
    if (result.status === 'fulfilled') {
      const n = countBrandMentions(result.value, brand)
      component_scores_json[domain] = n >= 2 ? 20 : n === 1 ? 12 : 0
    } else {
      component_scores_json[domain] = 0
    }
  }

  // Listicle component — from the best ${category} search already fetched in Phase 1
  let listicle_appearances = 0
  if (bestCategoryResult.status === 'fulfilled') {
    const brandCount = countBrandMentions(bestCategoryResult.value, brand)
    listicle_appearances = brandCount >= 5 ? 25 : brandCount >= 3 ? 15 : brandCount >= 1 ? 8 : 0
  }
  component_scores_json['listicle_appearances'] = listicle_appearances

  const raw_score = Math.min(100, Object.values(component_scores_json).reduce((a, b) => a + b, 0))

  return { raw_score, component_scores_json }
}
