import Anthropic from '@anthropic-ai/sdk'
import type { CrawledSite } from './crawler'
import type { InferenceResult } from './db/types'

const client = new Anthropic()

export interface GeneratedProbe {
  prompt_text: string
  prompt_type: 'discovery' | 'comparison' | 'job_to_be_done'
}

// ---- Business understanding ----

export async function inferBusinessContext(site: CrawledSite): Promise<InferenceResult> {
  const pageContent = site.pages
    .map((p) => `=== ${p.url} ===\n${p.text}`)
    .join('\n\n')
    .slice(0, 12_000) // ~3k tokens

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
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

  return JSON.parse(jsonStr) as InferenceResult
}

// ---- Probe generation ----

export async function generateProbes(inference: InferenceResult): Promise<GeneratedProbe[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
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

Generate 18-24 prompts across three types. Return a JSON array with objects containing "prompt_text" and "prompt_type".

Types and examples:
1. "discovery" — prompts someone would use to find tools in this category
   e.g. "Best ${inference.category} tools", "Top ${inference.category} for ${inference.target_customer}"
   Generate 6-8 discovery prompts.

2. "comparison" — prompts comparing this brand to competitors
   e.g. "${inference.company_name} vs [Competitor]", "Is ${inference.company_name} better than [Competitor]?"
   Generate one prompt per competitor (${inference.competitors.length} prompts).

3. "job_to_be_done" — prompts framed around the task, not the category
   e.g. "How do I ${inference.primary_use_case}?", "Software to help me ${inference.primary_use_case}"
   Generate 5-7 job-to-be-done prompts.

Rules:
- Make prompts sound like real user queries, not formal questions
- Vary phrasing — avoid repetition
- Do not include the company name in discovery or job-to-be-done prompts
- Return ONLY a valid JSON array, no explanation

[{"prompt_text": "...", "prompt_type": "discovery"}, ...]`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  const probes = JSON.parse(jsonStr) as GeneratedProbe[]

  // Deduplicate by normalized prompt text
  const seen = new Set<string>()
  return probes.filter((p) => {
    const key = p.prompt_text.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
