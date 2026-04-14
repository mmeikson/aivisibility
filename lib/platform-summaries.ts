import Anthropic from '@anthropic-ai/sdk'
import type { Probe } from '@/lib/db/types'

const PLATFORM_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  perplexity: 'Perplexity',
  google: 'Gemini',
}

export async function generatePlatformSummaries(
  probes: Probe[],
  companyName: string
): Promise<Record<string, string>> {
  const platforms = ['openai', 'anthropic', 'perplexity', 'google']

  const platformData = platforms.flatMap((platform) => {
    const complete = probes.filter(
      (p) => p.platform === platform && p.status === 'complete' && p.response_text
    )
    if (complete.length === 0) return []

    const excerpts = complete.map((p, i) => {
      const mentioned = p.parsed_json?.was_mentioned ? 'mentioned' : 'not mentioned'
      const strength = p.parsed_json?.recommendation_strength ?? 'none'
      const excerpt = (p.response_text ?? '').slice(0, 300).replace(/\n+/g, ' ')
      return `[${i + 1}] ${p.prompt_type} — ${companyName} ${mentioned} (${strength}): "${excerpt}"`
    }).join('\n')

    return [{ platform, label: PLATFORM_LABELS[platform] ?? platform, excerpts }]
  })

  if (platformData.length === 0) return {}

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Summarize how each AI engine responds to queries about "${companyName}".

For each engine, write ONE sentence (max 30 words) that captures:
- Whether the engine mentions or recommends ${companyName}
- The key positioning or framing used (if mentioned)
- Which competitors appear alongside it (if any)

Be specific and concrete. If ${companyName} isn't mentioned, say what the engine recommends instead.

Return ONLY a JSON object with platform keys: { "openai": "...", "anthropic": "...", "perplexity": "...", "google": "..." }

${platformData.map(d => `=== ${d.label} ===\n${d.excerpts}`).join('\n\n')}`,
    }],
  })

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '{}'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  try {
    return JSON.parse(jsonStr) as Record<string, string>
  } catch {
    console.error('Platform summaries JSON parse failed:', jsonStr.slice(0, 200))
    return {}
  }
}
