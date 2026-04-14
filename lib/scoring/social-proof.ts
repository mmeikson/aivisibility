import type { InferenceResult } from '@/lib/db/types'

// Social Proof Score (0–100)
// Sources are selected based on the brand's vertical — SaaS review sites are
// irrelevant for consumer products, Amazon reviews are irrelevant for B2B tools.

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

// ---- Vertical detection ----

type Vertical = 'saas' | 'consumer' | 'health_wellness' | 'fintech'

function detectVertical(category: string): Vertical {
  const c = category.toLowerCase()

  const healthTerms = ['supplement', 'nutrition', 'vitamin', 'probiotic', 'protein', 'herbal',
    'wellness', 'weight loss', 'weight management', 'diet', 'fitness', 'health food',
    'nutraceutical', 'natural remedy', 'medical', 'pharma', 'skincare', 'cosmetic', 'beauty']
  if (healthTerms.some((t) => c.includes(t))) return 'health_wellness'

  const consumerTerms = ['apparel', 'clothing', 'fashion', 'baby', 'stroller', 'toy', 'furniture',
    'home goods', 'consumer product', 'cpg', 'food', 'beverage', 'drink', 'snack', 'grocery',
    'electronics', 'gadget', 'device', 'outdoor', 'sporting goods', 'pet', 'retail']
  if (consumerTerms.some((t) => c.includes(t))) return 'consumer'

  const fintechTerms = ['finance', 'financial', 'banking', 'bank', 'insurance', 'invest',
    'loan', 'mortgage', 'credit', 'payment', 'fintech', 'trading', 'crypto', 'wealth',
    'accounting', 'tax', 'payroll', 'expense']
  if (fintechTerms.some((t) => c.includes(t))) return 'fintech'

  return 'saas'
}

// ---- Vertical source configs ----

interface SourceConfig {
  searches: (brand: string, category: string, competitor: string) => Array<Promise<SerpResult>>
  score: (results: Array<PromiseSettledResult<SerpResult>>, brand: string, competitor: string) => Record<string, number>
}

const VERTICAL_CONFIGS: Record<Vertical, SourceConfig> = {
  saas: {
    searches: (brand, category, competitor) => [
      serpSearch(`"${brand}" reviews site:g2.com`, 5),
      serpSearch(`"${brand}" reviews site:capterra.com`, 5),
      serpSearch(`"${brand}" site:reddit.com`, 10),
      serpSearch(`best ${category}`, 20),
      serpSearch(`"${brand}" site:producthunt.com`, 3),
      competitor ? serpSearch(`best ${category} ${competitor}`, 20) : Promise.resolve({}),
    ],
    score: ([g2R, capR, redditR, listicleR, phR, compR], brand, competitor) => {
      let g2_presence = 0
      if (g2R.status === 'fulfilled') {
        const n = countDomainAppearances(g2R.value, 'g2.com')
        g2_presence = n >= 2 ? 25 : n === 1 ? 15 : 0
      }
      let capterra_presence = 0
      if (capR.status === 'fulfilled') {
        const n = countDomainAppearances(capR.value, 'capterra.com')
        capterra_presence = n >= 2 ? 15 : n === 1 ? 8 : 0
      }
      let reddit_mentions = 0
      if (redditR.status === 'fulfilled') {
        const n = countDomainAppearances(redditR.value, 'reddit.com')
        reddit_mentions = n >= 5 ? 20 : n >= 3 ? 14 : n >= 1 ? 7 : 0
      }
      let listicle_appearances = 0
      if (listicleR.status === 'fulfilled') {
        const brandCount = countBrandMentions(listicleR.value, brand)
        const compCount = competitor && compR.status === 'fulfilled'
          ? countBrandMentions(compR.value, competitor) : brandCount
        if (compCount > 0) listicle_appearances = Math.min(25, Math.round((brandCount / compCount) * 25))
        else if (brandCount > 0) listicle_appearances = 12
      }
      let product_hunt = 0
      if (phR.status === 'fulfilled') {
        product_hunt = countDomainAppearances(phR.value, 'producthunt.com') > 0 ? 10 : 0
      }
      return { g2_presence, capterra_presence, reddit_mentions, listicle_appearances, product_hunt }
    },
  },

  consumer: {
    searches: (brand, category, competitor) => [
      serpSearch(`"${brand}" reviews site:amazon.com`, 5),
      serpSearch(`"${brand}" reviews site:trustpilot.com`, 5),
      serpSearch(`"${brand}" site:reddit.com`, 10),
      serpSearch(`best ${category}`, 20),
      serpSearch(`"${brand}" review site:youtube.com`, 5),
      competitor ? serpSearch(`best ${category} ${competitor}`, 20) : Promise.resolve({}),
    ],
    score: ([amzR, tpR, redditR, listicleR, ytR, compR], brand, competitor) => {
      let amazon_reviews = 0
      if (amzR.status === 'fulfilled') {
        const n = countDomainAppearances(amzR.value, 'amazon.com')
        amazon_reviews = n >= 3 ? 30 : n >= 1 ? 18 : 0
      }
      let trustpilot_presence = 0
      if (tpR.status === 'fulfilled') {
        const n = countDomainAppearances(tpR.value, 'trustpilot.com')
        trustpilot_presence = n >= 2 ? 20 : n === 1 ? 12 : 0
      }
      let reddit_mentions = 0
      if (redditR.status === 'fulfilled') {
        const n = countDomainAppearances(redditR.value, 'reddit.com')
        reddit_mentions = n >= 5 ? 20 : n >= 3 ? 14 : n >= 1 ? 7 : 0
      }
      let listicle_appearances = 0
      if (listicleR.status === 'fulfilled') {
        const brandCount = countBrandMentions(listicleR.value, brand)
        const compCount = competitor && compR.status === 'fulfilled'
          ? countBrandMentions(compR.value, competitor) : brandCount
        if (compCount > 0) listicle_appearances = Math.min(25, Math.round((brandCount / compCount) * 25))
        else if (brandCount > 0) listicle_appearances = 12
      }
      let youtube_reviews = 0
      if (ytR.status === 'fulfilled') {
        youtube_reviews = countDomainAppearances(ytR.value, 'youtube.com') > 0 ? 5 : 0
      }
      return { amazon_reviews, trustpilot_presence, reddit_mentions, listicle_appearances, youtube_reviews }
    },
  },

  health_wellness: {
    searches: (brand, category, competitor) => [
      serpSearch(`"${brand}" reviews site:amazon.com`, 5),
      serpSearch(`"${brand}" reviews site:trustpilot.com`, 5),
      serpSearch(`"${brand}" site:reddit.com`, 10),
      serpSearch(`best ${category}`, 20),
      serpSearch(`"${brand}" review`, 10), // editorial: healthline, webmd, etc.
      competitor ? serpSearch(`best ${category} ${competitor}`, 20) : Promise.resolve({}),
    ],
    score: ([amzR, tpR, redditR, listicleR, editorialR, compR], brand, competitor) => {
      let amazon_reviews = 0
      if (amzR.status === 'fulfilled') {
        const n = countDomainAppearances(amzR.value, 'amazon.com')
        amazon_reviews = n >= 3 ? 25 : n >= 1 ? 15 : 0
      }
      let trustpilot_presence = 0
      if (tpR.status === 'fulfilled') {
        const n = countDomainAppearances(tpR.value, 'trustpilot.com')
        trustpilot_presence = n >= 2 ? 15 : n === 1 ? 8 : 0
      }
      let reddit_mentions = 0
      if (redditR.status === 'fulfilled') {
        const n = countDomainAppearances(redditR.value, 'reddit.com')
        reddit_mentions = n >= 5 ? 20 : n >= 3 ? 14 : n >= 1 ? 7 : 0
      }
      let listicle_appearances = 0
      if (listicleR.status === 'fulfilled') {
        const brandCount = countBrandMentions(listicleR.value, brand)
        const compCount = competitor && compR.status === 'fulfilled'
          ? countBrandMentions(compR.value, competitor) : brandCount
        if (compCount > 0) listicle_appearances = Math.min(30, Math.round((brandCount / compCount) * 30))
        else if (brandCount > 0) listicle_appearances = 15
      }
      // Editorial: count results from known health publishers
      const HEALTH_PUBLISHERS = ['healthline', 'webmd', 'medicalnewstoday', 'verywellhealth', 'consumerlab', 'examine.com']
      let editorial_mentions = 0
      if (editorialR.status === 'fulfilled') {
        const n = (editorialR.value.organic_results ?? []).filter((r) =>
          HEALTH_PUBLISHERS.some((pub) => r.link?.toLowerCase().includes(pub))
        ).length
        editorial_mentions = n >= 2 ? 10 : n === 1 ? 6 : 0
      }
      return { amazon_reviews, trustpilot_presence, reddit_mentions, listicle_appearances, editorial_mentions }
    },
  },

  fintech: {
    searches: (brand, category, competitor) => [
      serpSearch(`"${brand}" reviews site:trustpilot.com`, 5),
      serpSearch(`"${brand}" review site:nerdwallet.com OR site:forbes.com OR site:bankrate.com OR site:investopedia.com`, 5),
      serpSearch(`"${brand}" site:reddit.com`, 10),
      serpSearch(`best ${category}`, 20),
      serpSearch(`"${brand}" app reviews`, 5),
      competitor ? serpSearch(`best ${category} ${competitor}`, 20) : Promise.resolve({}),
    ],
    score: ([tpR, editorialR, redditR, listicleR, appR, compR], brand, competitor) => {
      let trustpilot_presence = 0
      if (tpR.status === 'fulfilled') {
        const n = countDomainAppearances(tpR.value, 'trustpilot.com')
        trustpilot_presence = n >= 2 ? 25 : n === 1 ? 15 : 0
      }
      const FINTECH_PUBLISHERS = ['nerdwallet', 'forbes', 'bankrate', 'investopedia', 'thebalance', 'valuepenguin', 'moneyunder30']
      let editorial_mentions = 0
      if (editorialR.status === 'fulfilled') {
        const n = (editorialR.value.organic_results ?? []).filter((r) =>
          FINTECH_PUBLISHERS.some((pub) => r.link?.toLowerCase().includes(pub))
        ).length
        editorial_mentions = n >= 2 ? 20 : n === 1 ? 12 : 0
      }
      let reddit_mentions = 0
      if (redditR.status === 'fulfilled') {
        const n = countDomainAppearances(redditR.value, 'reddit.com')
        reddit_mentions = n >= 5 ? 20 : n >= 3 ? 14 : n >= 1 ? 7 : 0
      }
      let listicle_appearances = 0
      if (listicleR.status === 'fulfilled') {
        const brandCount = countBrandMentions(listicleR.value, brand)
        const compCount = competitor && compR.status === 'fulfilled'
          ? countBrandMentions(compR.value, competitor) : brandCount
        if (compCount > 0) listicle_appearances = Math.min(25, Math.round((brandCount / compCount) * 25))
        else if (brandCount > 0) listicle_appearances = 12
      }
      let app_reviews = 0
      if (appR.status === 'fulfilled') {
        const n = (appR.value.organic_results ?? []).filter((r) =>
          r.link?.toLowerCase().includes('apps.apple.com') ||
          r.link?.toLowerCase().includes('play.google.com')
        ).length
        app_reviews = n >= 1 ? 10 : 0
      }
      return { trustpilot_presence, editorial_mentions, reddit_mentions, listicle_appearances, app_reviews }
    },
  },
}

export async function scoreSocialProof(
  inference: InferenceResult
): Promise<{ raw_score: number; component_scores_json: Record<string, number> }> {
  const brand = inference.company_name
  const category = inference.category
  const topCompetitor = inference.competitors[0] ?? ''

  const vertical = detectVertical(category)
  const config = VERTICAL_CONFIGS[vertical]

  const results = await Promise.allSettled(config.searches(brand, category, topCompetitor))
  const component_scores_json = config.score(results, brand, topCompetitor)
  const raw_score = Math.min(100, Object.values(component_scores_json).reduce((a, b) => a + b, 0))

  return { raw_score, component_scores_json }
}
