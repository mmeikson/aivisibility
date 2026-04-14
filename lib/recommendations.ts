import Anthropic from '@anthropic-ai/sdk'
import type { Score, InferenceResult, ScoreCategory } from '@/lib/db/types'
import { severityLabel } from './scoring/priority'

const EFFORT: Record<ScoreCategory, string> = {
  entity: '1–3 days',
  retrieval: '2–6 weeks',
  category_association: '2–4 months',
  social_proof: '4–6 months',
}

const PLATFORMS: Record<ScoreCategory, string[]> = {
  entity: ['openai', 'anthropic', 'perplexity', 'google'],
  category_association: ['openai', 'anthropic'],
  retrieval: ['perplexity', 'google'],
  social_proof: ['openai', 'anthropic', 'perplexity', 'google'],
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

interface Recommendation {
  title: string
  type: ScoreCategory
  effort: string
  priority: number
  affected_platforms: string[]
  why_it_matters: string
  actions: string[]
  copy_asset_text: string
}

export async function generateRecommendations(
  score: Score,
  inference: InferenceResult
): Promise<Recommendation[]> {
  const client = getClient()
  const category = score.category as ScoreCategory
  const components = score.component_scores_json
  const severity = severityLabel(score.raw_score)

  // Find weakest components to focus on
  const weakComponents = Object.entries(components)
    .filter(([, pts]) => pts < 10)
    .map(([name]) => name.replace(/_/g, ' '))

  const prompt = `You are generating actionable recommendations for a brand's AI visibility audit.

The core user goal: get their brand mentioned when customers ask ChatGPT, Claude, or Perplexity about their category.

How LLMs decide what to recommend: They draw on their training data (web content, reviews, comparisons) and — for search-grounded models — live retrieval of authoritative sources. A brand gets recommended when: (1) it appears frequently and consistently across trusted third-party sources the model was trained on, (2) it's described in terms that match how users phrase their questions, (3) review platforms and community discussions reflect real user satisfaction.

Company: ${inference.company_name}
Category: ${inference.category}
Use case: ${inference.primary_use_case}
Target customer: ${inference.target_customer}

Score category: ${category.replace(/_/g, ' ')}
Score: ${score.raw_score}/100 (${severity})
Weak components: ${weakComponents.join(', ') || 'none identified'}

Generate 3 specific, actionable recommendations — one from EACH of these three contexts:
1. "website" — actions on the company's own domain (content, schema, pages)
2. "owned_platforms" — actions on platforms they control but don't own (G2, LinkedIn, Crunchbase, Capterra, Product Hunt, app stores, social profiles)
3. "outreach" — actions requiring third-party engagement (journalists, bloggers, Reddit communities, link building, PR, partnerships)

For each recommendation, the "why_it_matters" must explain the direct connection to AI recommendation behavior — not general SEO or marketing outcomes. Return a JSON array:
[{
  "context": "website" | "owned_platforms" | "outreach",
  "title": "action-oriented title, max 8 words",
  "why_it_matters": "2-3 sentences: what this company's specific gap is and exactly how fixing it causes AI models to mention them more often",
  "actions": ["step 1", "step 2", "step 3", "step 4"],
  "copy_asset": "ready-to-use text asset"
}]

IMPORTANT for action steps: prefix every step with where the work happens — "On your website:", "On G2:", "On LinkedIn:", etc. Never leave it ambiguous.

For the copy asset:
- entity: canonical one-sentence company description for consistent use across G2, LinkedIn, Crunchbase, Capterra
- category_association: content outline for a comparison page vs their top competitor (these pages are heavily indexed by AI models)
- retrieval: content brief for a page targeting a key discovery query your customers ask AI assistants
- social_proof: short review request email for customers (more recent G2/Capterra reviews directly feed AI training data)

Return ONLY valid JSON, no explanation.`

  type RawRec = { context?: string; title: string; why_it_matters: string; actions: string[]; copy_asset: string }
  let raw: RawRec[] | null = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
    const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    try {
      raw = JSON.parse(jsonStr) as RawRec[]
      break
    } catch {
      console.error(`Recommendations JSON parse failed (attempt ${attempt}/3) for ${category}:`, jsonStr.slice(0, 300))
      if (attempt === 3) return []
    }
  }

  if (!raw) return []

  return raw.map((r) => ({
    title: r.title,
    type: category,
    effort: EFFORT[category],
    priority: score.priority_score,
    affected_platforms: PLATFORMS[category],
    why_it_matters: r.why_it_matters,
    actions: r.actions,
    copy_asset_text: r.copy_asset,
  }))
}
