import Anthropic from '@anthropic-ai/sdk'
import { updateProbe } from '@/lib/db/queries'
import type { Probe, ParsedProbeResult } from '@/lib/db/types'

const BATCH_SIZE = 10

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function extractDomains(urls: string[]): string[] {
  return urls.flatMap((url) => {
    try {
      return [new URL(url).hostname.replace(/^www\./, '')]
    } catch {
      return []
    }
  })
}

async function parseBatch(
  probes: Probe[],
  companyName: string
): Promise<Map<string, ParsedProbeResult>> {
  const client = getClient()

  const input = probes.map((p, i) => ({
    index: i,
    id: p.id,
    prompt: p.prompt_text,
    response: (p.response_text ?? '').slice(0, 2000), // cap per response
  }))

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are extracting structured data from AI-generated responses to measure brand visibility.

Brand name to look for: "${companyName}"

For each response below, extract:
- was_mentioned: true if the brand name appears anywhere in the response
- mention_positions: ONLY if the response contains an explicit numbered or bulleted list of recommendations/tools, which list position(s) (1-indexed) does the brand appear at. If there is no ranked list, return []. Do NOT return character positions or word counts.
- recommendation_strength: "none" if not mentioned, "hedged" if mentioned with caveats/qualifications, "confident" if recommended directly
- competitor_mentions: array of any competitor/alternative brand names mentioned
- cited_urls: copy the cited_urls array from the input (already extracted)

Return a JSON array with one object per input, in the same order.

Input:
${JSON.stringify(input, null, 2)}

Return ONLY a valid JSON array, no explanation:
[{"index": 0, "was_mentioned": bool, "mention_positions": [], "recommendation_strength": "none|hedged|confident", "competitor_mentions": [], "cited_urls": []}, ...]`,
      },
    ],
  })

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const parsed = JSON.parse(jsonStr) as Array<{
    index: number
    was_mentioned: boolean
    mention_positions: number[]
    recommendation_strength: 'none' | 'hedged' | 'confident'
    competitor_mentions: string[]
    cited_urls: string[]
  }>

  const results = new Map<string, ParsedProbeResult>()
  for (const item of parsed) {
    const probe = probes[item.index]
    if (!probe) continue
    const citedUrls = probe.citations ?? []
    results.set(probe.id, {
      was_mentioned: item.was_mentioned,
      mention_positions: item.mention_positions ?? [],
      recommendation_strength: item.recommendation_strength ?? 'none',
      competitor_mentions: item.competitor_mentions ?? [],
      cited_urls: citedUrls,
      cited_domains: extractDomains(citedUrls),
    })
  }
  return results
}

export async function parseProbeResponses(
  probes: Probe[],
  companyName: string
): Promise<void> {
  const eligible = probes.filter((p) => p.status === 'complete' && p.response_text)

  // Process in batches
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE)
    try {
      const results = await parseBatch(batch, companyName)
      await Promise.all(
        batch.map((probe) => {
          const parsed = results.get(probe.id)
          if (parsed) return updateProbe(probe.id, { parsed_json: parsed })
        })
      )
    } catch (err) {
      console.error(`Parse batch ${i / BATCH_SIZE + 1} failed:`, err)
      // Non-fatal — continue with remaining batches
    }
  }
}
