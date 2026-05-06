import Anthropic from '@anthropic-ai/sdk'
import type { Probe, PlatformPerception } from '@/lib/db/types'

const PLATFORM_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  google: 'Gemini',
}

const ACTIVE_PLATFORMS = ['openai', 'anthropic', 'google']

export async function generatePlatformSummaries(
  probes: Probe[],
  companyName: string
): Promise<Record<string, string>> {
  const perceptions = await generatePlatformPerceptions(probes, companyName)
  return Object.fromEntries(
    Object.entries(perceptions).map(([k, v]) => [k, v.summary])
  )
}

export async function generatePlatformPerceptions(
  probes: Probe[],
  companyName: string
): Promise<Record<string, PlatformPerception>> {
  const platformData = ACTIVE_PLATFORMS.flatMap((platform) => {
    const complete = probes.filter(
      (p) => p.platform === platform && p.status === 'complete' && p.response_text
    )
    if (complete.length === 0) return []

    const excerpts = complete.map((p, i) => {
      const mentioned = p.parsed_json?.was_mentioned ? 'mentioned' : 'not mentioned'
      const strength = p.parsed_json?.recommendation_strength ?? 'none'
      const text = (p.response_text ?? '').slice(0, 500).replace(/\n+/g, ' ')
      return `[${i + 1}] ${p.prompt_type} — ${companyName} ${mentioned} (${strength}): "${text}"`
    }).join('\n')

    return [{ platform, label: PLATFORM_LABELS[platform] ?? platform, excerpts }]
  })

  if (platformData.length === 0) return {}

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Analyze how each AI engine perceives and positions "${companyName}" based on its responses below.

For each engine return:
- "summary": 2-3 sentences describing how this engine frames ${companyName} within its category, how it positions it vs competitors, and any notable gaps or biases. Be specific and qualitative — no mention counts or statistics.
- "quotes": array of 2-3 SHORT verbatim excerpts (max 25 words each) copied exactly from the provided responses that best illustrate this perception. Only quote sentences that directly describe or evaluate ${companyName} or explain why it was or wasn't recommended. If ${companyName} is rarely or never mentioned, quote what the engine recommends instead.

Return ONLY valid JSON:
{
  "openai": { "summary": "...", "quotes": ["...", "..."] },
  "anthropic": { "summary": "...", "quotes": ["...", "..."] },
  "google": { "summary": "...", "quotes": ["...", "..."] }
}

Only include keys for platforms present in the data below.

${platformData.map(d => `=== ${d.label} ===\n${d.excerpts}`).join('\n\n')}`,
    }],
  })

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '{}'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  try {
    return JSON.parse(jsonStr) as Record<string, PlatformPerception>
  } catch {
    console.error('Platform perceptions JSON parse failed:', jsonStr.slice(0, 200))
    return {}
  }
}
