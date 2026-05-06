import Anthropic from '@anthropic-ai/sdk'
import type { Score, InferenceResult, ScoreCategory, ActionStep } from '@/lib/db/types'
import type { CitationSummary } from '@/lib/analysis/source-gaps'
import { severityLabel } from './scoring/priority'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

interface Recommendation {
  title: string
  type: ScoreCategory
  priority: number
  affected_platforms: string[]
  why_it_matters: string
  actions: string[]
  action_steps: ActionStep[]
}

type RawRec = {
  title: string
  type: ScoreCategory
  priority: number
  why_it_matters: string
  action_steps: ActionStep[]
}

const SCORE_LABELS: Record<ScoreCategory, string> = {
  category_association: 'Category Association',
  retrieval: 'Source Retrieval',
  entity: 'Entity Recognition',
  social_proof: 'Social Proof',
}

const PLATFORMS_BY_CATEGORY: Record<ScoreCategory, string[]> = {
  entity: ['openai', 'anthropic', 'google'],
  category_association: ['openai', 'anthropic'],
  retrieval: ['google'],
  social_proof: ['openai', 'anthropic', 'google'],
}

export async function generateRecommendations(
  scores: Score[],
  inference: InferenceResult,
  citationSummary?: CitationSummary
): Promise<Recommendation[]> {
  const client = getClient()

  const scoreContext = scores
    .map((s) => {
      const severity = severityLabel(s.raw_score)
      const componentGaps = Object.entries(s.component_scores_json)
        .map(([k, v]) => {
          const label = (v as number) >= 60 ? 'strong' : (v as number) >= 35 ? 'moderate' : 'weak'
          return `  ${k.replace(/_/g, ' ')}: ${label}`
        })
        .join('\n')
      return `${SCORE_LABELS[s.category as ScoreCategory] ?? s.category} — ${severity}\n${componentGaps}`
    })
    .join('\n\n')

  // Build domain rows with homepage snippets so Sonnet can identify competitors inline
  const domainRows = citationSummary?.citedDomains.map((d) => {
    const brandStatus = d.brandMentioned === true
      ? 'brand present'
      : d.brandMentioned === false
        ? 'brand NOT present'
        : 'presence unknown'
    const snippet = d.homepageSnippet ? ` — "${d.homepageSnippet.slice(0, 120)}"` : ''
    return `  ${d.domain} — cited ${d.citedInProbeCount}x — ${brandStatus}${snippet}`
  }).join('\n') ?? ''

  const citationContext = citationSummary ? `
Citation data — every domain AI models retrieved when answering queries about this category, ranked by frequency:
${domainRows || '  (no citation data available)'}

IMPORTANT: This list includes a mix of competitor-owned domains, editorial/media sites, review platforms, and communities. Use your own knowledge combined with the homepage descriptions above to determine which domains are competitors (i.e. they sell products or services that directly compete with ${inference.company_name}). Do NOT recommend any action steps targeting competitor-owned domains — pitching content to a competitor's site is not actionable. Restrict third-party action steps to genuinely independent sources: editorial media, communities, forums, review platforms, and industry publications.
`.trim() : ''

  const prompt = `You are generating a prioritized list of AI visibility recommendations for a brand.

The core goal: get their brand mentioned when customers ask ChatGPT, Claude, or Gemini about their category.

How LLMs decide what to recommend: They draw on training data (web content, reviews, comparisons, forums) and — for search-grounded models — live retrieval. A brand gets recommended when it appears frequently across trusted third-party sources, is described in terms matching how users ask questions, and has real user sentiment on review platforms and communities relevant to its market.

Company: ${inference.company_name}
Category: ${inference.category}
Use case: ${inference.primary_use_case}
Target customer: ${inference.target_customer}
Known competitors (not exhaustive): ${inference.competitors.join(', ')}

Scores:
${scoreContext}
${citationContext ? `\n${citationContext}` : ''}
Generate exactly 5 specific, actionable recommendations prioritized by impact and closability (quick wins first). Consider all score categories together — don't generate equal numbers per category, focus on what will most move AI visibility for this specific company.

Rules:
- Do NOT recommend platforms or tactics irrelevant to their business (e.g. don't suggest G2/Capterra for non-software companies)
- Do NOT recommend creating or editing a Wikipedia page
- Do NOT target competitor-owned domains in action steps — see citation context above
- why_it_matters must explain the direct mechanism: how this action causes AI models to mention the brand more
- why_it_matters must NOT quote score numbers, component labels, or signal levels
- why_it_matters must NOT mention specific domain names that are not in the citation data
- Use the citation data as ground truth for which third-party sources AI models actually retrieve
- "brand present" = confirmed brand appears on this page. Use "optimize" or "expand" — do NOT say "create" or "claim"
- "brand NOT present" = confirmed gap. You may recommend building presence there (only if it is NOT a competitor domain)
- Third-party domains in action_steps.target MUST appear verbatim in the citation data list above
- You MAY recommend on-site content actions (blog posts, comparison pages, documentation, landing pages) using the brand's own domain as target
- priority: integer 1–5 where 1 = highest impact. The list should be ordered this way
- type must be one of: "category_association", "retrieval", "entity", "social_proof"
- action_steps: "target" is the platform/channel (1–3 words), "step" is the specific action. Maximum 3 action steps per recommendation

Return ONLY valid JSON array:
[{
  "title": "action-oriented title, max 8 words",
  "type": "category_association",
  "priority": 1,
  "why_it_matters": "2 sentences max on the specific gap and how fixing it changes AI behavior for this company",
  "action_steps": [
    { "target": "your blog", "step": "publish a comparison page vs [top competitor] covering [key use case]" },
    { "target": "G2", "step": "run a review campaign targeting [customer segment]" }
  ]
}]`

  let raw: RawRec[] | null = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
    const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    try {
      raw = JSON.parse(jsonStr) as RawRec[]
      break
    } catch {
      console.error(`Recommendations JSON parse failed (attempt ${attempt}/3):`, jsonStr.slice(0, 300))
      if (attempt === 3) return []
    }
  }

  if (!raw) return []

  return raw.map((r) => ({
    title: r.title,
    type: (r.type as ScoreCategory) ?? 'category_association',
    priority: r.priority ?? 5,
    affected_platforms: PLATFORMS_BY_CATEGORY[r.type as ScoreCategory] ?? PLATFORMS_BY_CATEGORY.category_association,
    why_it_matters: r.why_it_matters,
    actions: (r.action_steps ?? []).map((s) => `${s.target}: ${s.step}`),
    action_steps: r.action_steps ?? [],
  }))
}
