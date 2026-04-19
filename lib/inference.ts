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

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a company website to extract structured business information for an AI visibility audit.

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
Category: ${inference.category}
Use case: ${inference.primary_use_case}
Target customer: ${inference.target_customer}

Each profile should represent a meaningfully different type of customer — different scale, role, or situation.
Return a JSON array with objects containing:
- "label": short name for this customer type (e.g. "Self-managing landlord")
- "context": one first-person sentence establishing their situation (e.g. "I self-manage 4 units across two properties")
- "primary_need": what they are primarily looking for (e.g. "collect rent online without a property manager")

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
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `You are quality-checking AI visibility test probes for ${inference.company_name}, a ${inference.category} company.

Select the best ${variableBudget} probes from the list below. Criteria:
- Sounds like a real user query (natural language, not marketing copy)
- No near-duplicate intents — each probe should surface different signal
- Discovery probes must vary in shape: feature-focused, persona-focused, budget-focused, etc.
- Job-to-be-done probes must invite a product or service recommendation as the answer — REJECT any that read as process or management questions where the natural answer is behavioral advice, not a product
- Prefer specific, concrete phrasings over generic ones

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
    ? `3. "job_to_be_done" (6 prompts) — mix of two styles:
   a) One prompt per customer profile below (${icpPersonas.length} prompts): write in first person using their context as a preamble, then state their need as a question. Format: "[context sentence]. [question]". Each profile must produce exactly one prompt with a DIFFERENT context preamble.
   b) ${6 - icpPersonas.length} additional prompts: direct needs using "I need...", "I'm looking for...", or "What's the best X for..." framing — no preamble, different intents from the ICP prompts above.
   All 6 must naturally invite a product or service recommendation. Do NOT include ${inference.company_name} in any of these.

Customer profiles for (a):
${icpPersonas.map((p) => `- ${p.label}: "${p.context}" (need: ${p.primary_need})`).join('\n')}`
    : `3. "job_to_be_done" (6 prompts) — a specific need or problem the user wants a product or service to solve.
   CRITICAL: frame these so that recommending a product or service is the natural answer.
   Use "I need...", "I'm looking for...", "What's the best X for..." framing.
   Avoid "How do I..." framing — that invites process advice, not product recommendations.
   Do NOT include ${inference.company_name} in these prompts.`

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
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

Generate 18 prompts across three types. Return a JSON array with objects containing "prompt_text" and "prompt_type".

Types and counts:
1. "discovery" (8 prompts) — prompts someone would use to find products or services in this category.
   Each must have a DIFFERENT query shape — do not just paraphrase the same question:
   - feature-focused: "Best [category] for [specific feature or capability]"
   - persona-focused: "Best [category] for [specific type of customer]"
   - budget/scale-focused: "Affordable [category] for [customer segment]"
   - comparison-seeking: "What are the top [category] alternatives to [known competitor]"
   - outcome-focused: "Best [category] to help with [specific outcome]"
   Do NOT include ${inference.company_name} in these prompts.

2. "comparison" (4 prompts) — natural user comparisons involving ${inference.company_name} and a competitor.
   Use a different competitor each time. Make them sound like real user questions, not templates.

${jtbdSection}

Rules:
- Every prompt must sound like something a real user would type into ChatGPT or Google
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
      prompt_text: `What is ${inference.company_name}? Describe what they do and who they serve.`,
      prompt_type: 'entity_check',
    },
    {
      prompt_text: `Tell me about ${inference.company_name} — what product or service do they offer?`,
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
      prompt_text: `Which is better for ${inference.category}: ${inference.company_name} or ${competitor}? Recommend one.`,
      prompt_type: 'pairwise' as const,
    }))

  // Fixed ranking probes
  const rankingProbes: GeneratedProbe[] = [
    {
      prompt_text: `What ${inference.category} tools would you recommend for ${inference.target_customer}? Give me your top picks.`,
      prompt_type: 'discovery',
    },
    {
      prompt_text: `I'm looking for ${inference.category} software. What would you suggest?`,
      prompt_type: 'job_to_be_done',
    },
    {
      prompt_text: `What are the top 5 ${inference.category} tools right now? Rank them from best to worst.`,
      prompt_type: 'ranking',
    },
  ]

  // Assemble and deduplicate
  // Two passes: (1) exact match, (2) shared opening sentence (catches same-preamble ICP variants)
  const allProbes = [...llmProbes, ...entityCheckProbes, ...pairwiseProbes, ...rankingProbes]
  const seenExact = new Set<string>()
  const seenOpening = new Set<string>()
  const deduped = allProbes.filter((p) => {
    const key = p.prompt_text.toLowerCase().trim()
    if (seenExact.has(key)) return false
    seenExact.add(key)
    // Extract opening sentence (up to first period/question mark followed by space or end)
    const opening = key.match(/^[^.?!]{20,}[.?!]/)?.[0]?.trim()
    if (opening) {
      if (seenOpening.has(opening)) return false
      seenOpening.add(opening)
    }
    return true
  })

  return qualityFilterProbes(deduped, inference, 20)
}
