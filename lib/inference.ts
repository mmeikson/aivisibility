import Anthropic from '@anthropic-ai/sdk'
import type { CrawledSite } from './crawler'
import type { InferenceResult, IcpPersona } from './db/types'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface GeneratedProbe {
  prompt_text: string
  prompt_type: 'discovery' | 'comparison' | 'job_to_be_done' | 'pairwise' | 'entity_check'
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
  "key_features": ["array of 4-6 distinctive product features or capabilities as brief noun phrases (e.g. 'automated rent collection', 'built-in tenant screening', 'mobile-first design') — focus on features that differentiate this product from competitors"],
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

// ---- Feature-match probe generation ----

async function generateFeatureMatchProbes(inference: InferenceResult): Promise<GeneratedProbe[]> {
  const features = inference.key_features
  if (!features || features.length === 0) return []

  try {
    const res = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Generate ${Math.min(features.length, 5)} short feature-match search queries for ${inference.category}.

These should sound like real user searches for software with a specific capability. Keep each under 12 words. Vary the format:
- "[category] with [feature]"
- "What [category] offers [feature]?"
- "[category] for [customer type] that includes [feature]"
- "How do [customer type] [achieve outcome]?"

Features to cover (one query per feature):
${features.slice(0, 5).map((f, i) => `${i + 1}. ${f}`).join('\n')}

Do NOT mention ${inference.company_name} in any query. Do NOT use "best" or "top".
Return ONLY a JSON array of strings. Example: ["query one", "query two"]`,
      }],
    })

    const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
    const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const queries = JSON.parse(jsonStr) as string[]
    return queries.slice(0, 5).map((q) => ({
      prompt_text: q,
      prompt_type: 'discovery' as const,
    }))
  } catch (err) {
    console.warn('[generateFeatureMatchProbes] failed:', err instanceof Error ? err.message : err)
    return []
  }
}

// ---- Probe generation ----

async function qualityFilterProbes(
  probes: GeneratedProbe[],
  inference: InferenceResult,
  maxCount: number
): Promise<GeneratedProbe[]> {
  // Fixed probe types must be preserved — they feed directly into scoring
  const FIXED_TYPES = new Set(['entity_check', 'pairwise'])
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
- Discovery probes must use salience-style phrasing — REJECT any containing "best", "top", "rank", "affordable", or "alternatives to" since these force list enumeration and inflate low-salience entities
- Job-to-be-done probes must use third-person framing and invite a product or service recommendation — REJECT first-person "I need..." phrasing and REJECT process/management questions where the natural answer is behavioral advice
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
    ? `3. "job_to_be_done" (6 prompts) — short, concise third-person questions (under 12 words each) that naturally invite a software recommendation.
   a) One prompt per customer profile below (${icpPersonas.length} prompts): base it on their primary need. Format: "What [category] do [brief customer type] use for [primary need]?" or "Which [category] works for [customer type] who need [brief need]?" — no long scenario preambles.
   b) ${6 - icpPersonas.length} additional prompts: short direct questions under 12 words. "What [category] do [customer type] use to [task]?" or "Which [category] tools handle [specific workflow]?" — different intents from the ICP prompts.
   All 6 must invite a product recommendation without forcing a ranked list. Do NOT include ${inference.company_name} in any of these.

Customer profiles for (a):
${icpPersonas.map((p) => `- ${p.label}: need: ${p.primary_need}`).join('\n')}`
    : `3. "job_to_be_done" (6 prompts) — short, concise third-person questions (under 12 words each) that invite a software recommendation.
   Use "What [category] do [customer type] use to [task]?" or "Which [category] tools handle [specific workflow]?" framing.
   Avoid first-person "I need..." phrasing and long scenario setups.
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
1. "discovery" (8 prompts) — prompts that measure natural brand salience (does the brand come up organically?).
   These must NOT use "best", "top", "rank", "affordable", or "alternatives to" — those force list enumeration and inflate low-salience entities.
   Keep each under 12 words. Real users type concise queries.
   Each must have a DIFFERENT query shape:
   - known-for: "What companies are known for [specific capability]?"
   - association: "Which [category] tools do [customer type] use for [outcome]?"
   - persona-fit: "What [category] do [specific customer type] typically use?"
   - leader: "Who are the leading [category] providers for [use case]?"
   - name-players: "Name [category] tools known for [feature or segment]."
   - general recall: "What companies come to mind in [category]?"
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
      prompt_text: `What is ${inference.company_name}?`,
      prompt_type: 'entity_check',
    },
    {
      prompt_text: `Is ${inference.company_name} a good option for ${inference.target_customer}?`,
      prompt_type: 'entity_check',
    },
    {
      prompt_text: `Who are ${inference.company_name}'s main competitors?`,
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
      prompt_text: `${inference.company_name} vs ${competitor} — which is better for ${inference.target_customer}?`,
      prompt_type: 'pairwise' as const,
    }))

  // Fixed salience probes
  const rankingProbes: GeneratedProbe[] = [
    {
      prompt_text: `What ${inference.category} do ${inference.target_customer} typically use?`,
      prompt_type: 'discovery',
    },
    {
      prompt_text: `Which companies are well-known in the ${inference.category} space?`,
      prompt_type: 'discovery',
    },
    {
      prompt_text: `What ${inference.category} do most ${inference.target_customer} consider?`,
      prompt_type: 'discovery',
    },
  ]

  // Feature-match probes: generated from key_features extracted during site crawl
  const featureMatchProbes = await generateFeatureMatchProbes(inference)

  // Assemble and deduplicate
  // Two passes: (1) exact match, (2) shared opening sentence (catches same-preamble ICP variants)
  const allProbes = [...llmProbes, ...entityCheckProbes, ...pairwiseProbes, ...rankingProbes, ...featureMatchProbes]
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

  return qualityFilterProbes(deduped, inference, 24)
}
