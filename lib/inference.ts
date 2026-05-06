import Anthropic from '@anthropic-ai/sdk'
import type { CrawledSite } from './crawler'
import type { InferenceResult, IcpPersona } from './db/types'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface GeneratedProbe {
  prompt_text: string
  prompt_type: 'discovery' | 'comparison' | 'job_to_be_done' | 'entity_check'
}

// Single Sonnet call: extract business context + generate probes together.
// Saves one full round-trip vs the previous two-step approach.
export async function inferAndGenerateProbes(site: CrawledSite): Promise<{
  inference: InferenceResult
  probes: GeneratedProbe[]
}> {
  const pageContent = site.pages
    .map((p) => `=== ${p.url} ===\n${p.text}`)
    .join('\n\n')
    .slice(0, 12_000)

  const urlHint = (() => {
    try {
      const u = new URL(site.inputUrl)
      const path = u.pathname.replace(/\/$/, '')
      if (path.length > 1) {
        return `\nIMPORTANT: The user submitted ${site.inputUrl}. If this is a product page within a larger company's site (e.g. /software/jira on atlassian.com), extract information about THAT specific product — not the parent company. Use the product name as company_name.\n`
      }
    } catch { /* ignore */ }
    return ''
  })()

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Analyze this website and return a JSON object with business context and AI visibility test probes.
${urlHint}
The "probes" array must contain exactly 8 objects with "prompt_text" and "prompt_type" fields:
- 3 probes with prompt_type "discovery": measure natural brand salience in niche contexts. Under 12 words each. Use specific capability angles, customer segments, or use-case framings not covered by generic category queries. Do NOT use "best"/"top"/"rank"/"affordable"/"alternatives". Do NOT name the company.
- 2 probes with prompt_type "comparison": natural user comparisons naming the company vs a different competitor each time. Max 15 words each.
- 3 probes with prompt_type "job_to_be_done": third-person questions under 12 words inviting a product recommendation. "What [category] do [customer type] use to [task]?" or "Which [category] tools handle [specific workflow]?". Do NOT name the company.

Return exactly this JSON structure with no comments:
{
  "company_name": "brand/product name",
  "canonical_description": "max 30 words: category + primary use case + key differentiator",
  "category": "product category as common noun phrase (e.g. 'project management software')",
  "primary_use_case": "core job the product does for customers",
  "target_customer": "who the primary customer is (e.g. 'small business owners')",
  "competitors": ["4-6 competitor names inferred from positioning"],
  "key_features": ["4-6 distinctive features as brief noun phrases"],
  "confidence": {
    "company_name": "high|medium|low",
    "canonical_description": "high|medium|low",
    "category": "high|medium|low",
    "primary_use_case": "high|medium|low",
    "target_customer": "high|medium|low",
    "competitors": "high|medium|low"
  },
  "probes": [
    {"prompt_text": "...", "prompt_type": "discovery"},
    {"prompt_text": "...", "prompt_type": "discovery"},
    {"prompt_text": "...", "prompt_type": "discovery"},
    {"prompt_text": "...", "prompt_type": "comparison"},
    {"prompt_text": "...", "prompt_type": "comparison"},
    {"prompt_text": "...", "prompt_type": "job_to_be_done"},
    {"prompt_text": "...", "prompt_type": "job_to_be_done"},
    {"prompt_text": "...", "prompt_type": "job_to_be_done"}
  ]
}

Return ONLY valid JSON.

Website content:
${pageContent}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[inferAndGenerateProbes] JSON parse failed, retrying:', jsonStr.slice(0, 200))
    const retry = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: `Return ONLY valid JSON, no explanation:\n\n${jsonStr}` }],
    })
    const retryText = retry.content[0].type === 'text' ? retry.content[0].text : ''
    parsed = JSON.parse(retryText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim())
  }

  const llmProbes: GeneratedProbe[] = (parsed.probes ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p?.prompt_text && p?.prompt_type
  )

  const { probes: _probes, ...inferenceFields } = parsed
  const inference = inferenceFields as InferenceResult

  // Fixed salience probes: broad category recall — harder than niche queries, calibrate the score
  const salienceProbes: GeneratedProbe[] = [
    { prompt_text: `What are the most popular ${inference.category} options?`, prompt_type: 'discovery' },
    { prompt_text: `Which ${inference.category} do ${inference.target_customer} typically use?`, prompt_type: 'discovery' },
    { prompt_text: `What ${inference.category} would you recommend for ${inference.target_customer}?`, prompt_type: 'discovery' },
    { prompt_text: `What ${inference.category} are ${inference.target_customer} switching to?`, prompt_type: 'discovery' },
  ]

  // Fixed probes: templated from inference context, always included
  const entityCheckProbes: GeneratedProbe[] = [
    { prompt_text: `What is ${inference.company_name}?`, prompt_type: 'entity_check' },
    { prompt_text: `Is ${inference.company_name} a good option for ${inference.target_customer}?`, prompt_type: 'entity_check' },
  ]

  // Pairwise: use competitors not already covered by LLM comparison probes
  const comparisonCompetitors = new Set(
    (inference.competitors ?? []).filter((c) =>
      llmProbes.some((p) => p.prompt_type === 'comparison' && p.prompt_text.toLowerCase().includes(c.toLowerCase()))
    )
  )
  const pairwiseProbes: GeneratedProbe[] = (inference.competitors ?? [])
    .filter((c) => !comparisonCompetitors.has(c))
    .slice(0, 1)
    .map((competitor) => ({
      prompt_text: `${inference.company_name} vs ${competitor} — which is better for ${inference.target_customer}?`,
      prompt_type: 'comparison' as const,
    }))

  const allProbes = [...llmProbes, ...salienceProbes, ...entityCheckProbes, ...pairwiseProbes]
  const seen = new Set<string>()
  const deduped = allProbes.filter((p) => {
    const key = p.prompt_text.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { inference, probes: deduped }
}

// ICP persona generation — used by optional ENABLE_ICP_PROBES feature flag
export async function generateIcpPersonas(inference: InferenceResult): Promise<IcpPersona[]> {
  const res = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Generate 3 distinct ideal customer profiles for the following brand.

Brand: ${inference.company_name}
Description: ${inference.canonical_description}
Category: ${inference.category}
Primary use case: ${inference.primary_use_case}
Target customer: ${inference.target_customer}
Key competitors: ${inference.competitors.slice(0, 5).join(', ')}

IMPORTANT: Base the personas on who this brand is PRIMARILY positioned for — the customers their marketing, pricing, and product decisions are clearly aimed at. Do NOT generate personas for the broadest possible addressable market.

Each profile should represent a meaningfully different type of customer in that primary market — different team size, role, or specific pain point — but all should feel like the brand's core buyers.

Return a JSON array with objects containing:
- "label": short name for this customer type (e.g. "Solo SaaS founder")
- "context": one first-person sentence establishing their situation
- "primary_need": what they are primarily looking for

Return ONLY valid JSON, no explanation.`,
    }],
  })

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(jsonStr) as IcpPersona[]
}
