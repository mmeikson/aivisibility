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

Company: ${inference.company_name}
Category: ${inference.category}
Use case: ${inference.primary_use_case}
Target customer: ${inference.target_customer}

Score category: ${category.replace(/_/g, ' ')}
Score: ${score.raw_score}/100 (${severity})
Weak components: ${weakComponents.join(', ') || 'none identified'}

Generate 2–3 specific, actionable recommendations for this category. Return a JSON array:
[{
  "title": "action-oriented title, max 8 words",
  "why_it_matters": "2-3 sentences specific to this company explaining the impact",
  "actions": ["step 1", "step 2", "step 3", "step 4"],
  "copy_asset": "ready-to-use text asset (description, content brief, email template, etc.)"
}]

For the copy asset:
- entity category: write a canonical one-sentence company description optimized for consistency across G2, LinkedIn, Crunchbase, Capterra
- category_association category: write a content outline for a comparison page vs their top competitor
- retrieval category: write a content brief for a high-priority page targeting a key discovery query
- social_proof category: write a short review request email template for customers

Return ONLY valid JSON, no explanation.`

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  type RawRec = { title: string; why_it_matters: string; actions: string[]; copy_asset: string }
  let raw: RawRec[]
  try {
    raw = JSON.parse(jsonStr) as RawRec[]
  } catch {
    console.error('Failed to parse recommendations JSON for', category, jsonStr.slice(0, 200))
    return []
  }

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
