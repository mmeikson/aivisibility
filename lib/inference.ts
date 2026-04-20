import Anthropic from '@anthropic-ai/sdk'
import type { CrawledSite } from './crawler'
import type { InferenceResult, IcpPersona } from './db/types'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface GeneratedProbe {
  prompt_text: string
  prompt_type: 'discovery' | 'comparison' | 'job_to_be_done' | 'pairwise' | 'entity_check' | 'ranking'
}

// ---- Business understanding ----

export async function inferBusinessContext(site: CrawledSite): Promise<InferenceResult> {
  const pageContent = site.pages
    .map((p) => `=== ${p.url} ===\n${p.text}`)
    .join('\n\n')
    .slice(0, 12_000) // ~3k tokens

  // If the user submitted a product-specific URL (e.g. atlassian.com/software/jira),
  // tell the model to focus on that product rather than the parent company.
  const urlHint = (() => {
    try {
      const u = new URL(site.inputUrl)
      const path = u.pathname.replace(/\/$/, '')
      if (path.length > 1) {
        return `\nIMPORTANT: The user submitted this specific URL: ${site.inputUrl}. If this is a product page within a larger company's site (e.g. /software/jira on atlassian.com), extract information about THAT specific product — not the parent company. Use the product name as company_name.\n`
      }
    } catch { /* ignore */ }
    return ''
  })()

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a company website to extract structured business information for an AI visibility audit.
${urlHint}
Analyze the following website content and return a JSON object with these exact fields:

{
  "company_name": "string — the brand/product name",
  "canonical_description": "string — max 30 words: product category + primary use case + key differentiator",
  "category": "string — product category as a common noun phrase (e.g. 'project management software', 'email marketing platform')",
  "primary_use_case": "string — the core job the product does for customers",
  "target_customer": "string — who the primary customer is (e.g. 'small business owners', 'enterprise marketing teams')",
  "competitors": ["array of 4-6 competitor company/product names, inferred from the positioning and copy"],
  "confidence": {
    "company_name": "high|medium|low",
    "canonical_description": "high|medium|low",
    "category": "high|medium|low",
    "primary_use_case": "high|medium|low",
    "target_customer": "high|medium|low",
    "competitors": "high|medium|low"
  }
}

Return ONLY valid JSON, no explanation.

Website content:
${pageContent}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown code fences if present
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    return JSON.parse(jsonStr) as InferenceResult
  } catch {
    console.error('[inferBusinessContext] JSON parse failed, retrying once:', jsonStr.slice(0, 200))
    // Retry once with an explicit JSON reminder
    const retry = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: `Return ONLY valid JSON, no explanation, no markdown:\n\n${jsonStr}` },
      ],
    })
    const retryText = retry.content[0].type === 'text' ? retry.content[0].text : ''
    const retryJson = retryText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(retryJson) as InferenceResult
  }
}

// ---- ICP generation ----

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

IMPORTANT: Base the personas on who this brand is PRIMARILY positioned for — the customers their marketing, pricing, and product decisions are clearly aimed at. Do NOT generate personas for the broadest possible addressable market. Use the description and competitive positioning as the strongest signal.

Each profile should represent a meaningfully different type of customer in that primary market — different team size, role, or specific pain point — but all should feel like the brand's core buyers.

Return a JSON array with objects containing:
- "label": short name for this customer type (e.g. "Solo SaaS founder")
- "context": one first-person sentence establishing their situation (e.g. "I'm building my SaaS product solo and shipping new features every week")
- "primary_need": what they are primarily looking for (e.g. "lightweight issue tracking without Jira overhead")

Return ONLY valid JSON, no explanation.`,
    }],
  })

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(jsonStr) as IcpPersona[]
}

// ---- Probe generation ----

async function qualityFilterProbes(
  probes: GeneratedProbe[],
  inference: InferenceResult,
  maxCount: number
): Promise<GeneratedProbe[]> {
  // Fixed probe types must be preserved — they feed directly into scoring
  const FIXED_TYPES = new Set(['entity_check', 'pairwise', 'ranking'])
  const fixed = probes.filter((p) => FIXED_TYPES.has(p.prompt_type))
  const variable = probes.filter((p) => !FIXED_TYPES.has(p.prompt_type))
  const variableBudget = maxCount - fixed.length

  if (variable.length <= variableBudget) return probes

  const input = variable.map((p, i) => ({ index: i, prompt_text: p.prompt_text, prompt_type: p.prompt_type }))

  try {
    const res = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `You are selecting the best AI visibility test probes for ${inference.company_name}, a ${inference.category} company targeting: ${inference.target_customer}.

Pick the best ${variableBudget} probes from the list. Most probes will be good — you are ranking and selecting, not aggressively filtering. Prefer probes that:
- Cover diverse intents (don't pick near-duplicates that surface the same signal)
- Are grounded in the brand's actual target customer and use case
- Naturally invite a product or service recommendation (not process advice)
- Sound like something a real person would type — conversational, not marketing copy

Only exclude a probe if it clearly fails one of those criteria. You should return close to ${variableBudget} indices.

Return ONLY a JSON array of indices to keep (e.g. [0, 2, 5, ...]). No explanation.

Probes:
${JSON.stringify(input, null, 2)}`,
      }],
    })

    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const indices = JSON.parse(jsonStr) as number[]
    const kept = indices
      .filter((i) => i >= 0 && i < variable.length)
      .slice(0, variableBudget)
      .map((i) => variable[i])

    if (kept.length < variableBudget * 0.5) {
      console.warn('[qualityFilterProbes] filter returned too few — falling back')
      return [...fixed, ...variable.slice(0, variableBudget)]
    }

    return [...fixed, ...kept]
  } catch (err) {
    console.warn('[qualityFilterProbes] failed, falling back:', err instanceof Error ? err.message : err)
    return [...fixed, ...variable.slice(0, variableBudget)]
  }
}

export async function generateProbes(inference: InferenceResult, icpPersonas?: IcpPersona[]): Promise<GeneratedProbe[]> {
  const jtbdSection = icpPersonas && icpPersonas.length > 0
    ? `3. "job_to_be_done" (8 prompts) — queries like someone would ask an AI assistant when they have a problem to solve. Conversational and direct, 1–2 sentences max. Brief context is fine but avoid the formal "[long setup]. [explicit question]" pattern.
   a) One prompt per customer profile below (${icpPersonas.length} prompts): capture each profile's need naturally, anchored to their specific situation. Adapt to the brand type. Software: "we're a 10-person dev team looking for something lighter than Jira". Services: "need an accountant who works with freelancers doing international client work". Consumer: "looking for meal kit delivery, family of 4 with a picky 8-year-old".
   b) ${8 - icpPersonas.length} additional prompts: direct queries with different intents from the ICP prompts above.
   All 8 must naturally invite a product or service recommendation. Do NOT include ${inference.company_name} in any of these.

Customer profiles for (a):
${icpPersonas.map((p) => `- ${p.label}: "${p.context}" (need: ${p.primary_need})`).join('\n')}`
    : `3. "job_to_be_done" (8 prompts) — queries like someone would ask an AI assistant when they have a problem to solve. Conversational and direct, 1–2 sentences max. Brief context is fine but avoid the formal "[long setup]. [explicit question]" pattern.
   Adapt to the brand type. Software: "need something lighter than Jira for sprint planning, team of 12". Services: "looking for an accountant who handles freelancers with international clients". Consumer: "best meal kit delivery for a family with picky eaters".
   CRITICAL: frame these so that recommending a product or service is the natural answer.
   CRITICAL: all queries must be within the brand's target customer and use case — do NOT generate queries for customer segments outside the brand's positioning.
   Do NOT include ${inference.company_name} in these prompts.`

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are generating test prompts to measure a brand's visibility in AI-generated responses.

Company details:
- Name: ${inference.company_name}
- Category: ${inference.category}
- Use case: ${inference.primary_use_case}
- Target customer: ${inference.target_customer}
- Known competitors: ${inference.competitors.join(', ')}

Generate 24 prompts across three types. Return a JSON array with objects containing "prompt_text" and "prompt_type".

CRITICAL STYLE RULE: Write like a real person asking an AI assistant — conversational, natural, and direct. 1–2 sentences at most. Avoid the formal "[long context sentence]. [explicit question]" pattern — real users don't structure their thoughts that way. They might include brief context ("we're a 20-person team", "I've been using Asana but...") but they get to the point quickly. Not too terse either — a fragment like "issue tracking tool" is fine, but so is "we're a growing SaaS startup and need something better than spreadsheets for tracking bugs".

CRITICAL RELEVANCE RULE: Every prompt must be anchored to the brand's actual target customer and use case. Do NOT generate prompts for customer segments or use cases outside the brand's positioning (e.g. don't generate "affordable tool for early-stage startups" for an enterprise-focused brand). Every prompt should be a query where this brand is a plausible answer.

Types and counts:
1. "discovery" (10 prompts) — short search-bar queries to find products/services in this category, grounded in the brand's actual target customer.
   Each must have a DIFFERENT query shape. Adapt the shapes to fit the brand — not all will apply:
   - feature-focused: "best [category] for [specific feature or capability]"
   - persona-focused: "[category] for [specific buyer type or role]"
   - context-focused: "[category] for [situation, scale, or setting relevant to target customer]"
   - comparison-seeking: "top [category] alternatives to [competitor]"
   - outcome-focused: "[category] for [specific result the target customer wants]"
   Do NOT include ${inference.company_name} in these prompts.

2. "comparison" (6 prompts) — terse head-to-head queries involving ${inference.company_name} and a competitor.
   Use a different competitor each time. Examples: "${inference.company_name} vs [Competitor]", "is ${inference.company_name} better than [Competitor]", "[Competitor] alternative to ${inference.company_name}".

${jtbdSection}

Rules:
- No repetition of intent across prompts — each should surface different signal
- Return ONLY a valid JSON array, no explanation

[{"prompt_text": "...", "prompt_type": "discovery"}, ...]`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  const llmProbes = JSON.parse(jsonStr) as GeneratedProbe[]

  // Entity check probes: measure what AI models know about the brand directly
  const entityCheckProbes: GeneratedProbe[] = [
    {
      prompt_text: `What is ${inference.company_name}?`,
      prompt_type: 'entity_check',
    },
    {
      prompt_text: `What does ${inference.company_name} do?`,
      prompt_type: 'entity_check',
    },
  ]

  // Pairwise probes: direct competitive displacement (up to 3 competitors)
  // Skip any competitor already covered by a comparison probe to avoid duplication.
  const comparisonCompetitors = new Set(
    inference.competitors.filter((c) =>
      llmProbes.some(
        (p) => p.prompt_type === 'comparison' && p.prompt_text.toLowerCase().includes(c.toLowerCase())
      )
    )
  )
  const pairwiseProbes: GeneratedProbe[] = inference.competitors
    .filter((c) => !comparisonCompetitors.has(c))
    .slice(0, 3)
    .map((competitor) => ({
      prompt_text: `${inference.company_name} vs ${competitor}`,
      prompt_type: 'pairwise' as const,
    }))

  // Fixed ranking probes
  const rankingProbes: GeneratedProbe[] = [
    {
      prompt_text: `best ${inference.category} for ${inference.target_customer}`,
      prompt_type: 'discovery',
    },
    {
      prompt_text: `best ${inference.category} software right now`,
      prompt_type: 'job_to_be_done',
    },
    {
      prompt_text: `top ${inference.category} tools ranked`,
      prompt_type: 'ranking',
    },
  ]

  // Assemble and deduplicate on exact match only
  const allProbes = [...llmProbes, ...entityCheckProbes, ...pairwiseProbes, ...rankingProbes]
  const seenExact = new Set<string>()
  const deduped = allProbes.filter((p) => {
    const key = p.prompt_text.toLowerCase().trim()
    if (seenExact.has(key)) return false
    seenExact.add(key)
    return true
  })

  return qualityFilterProbes(deduped, inference, 20)
}
