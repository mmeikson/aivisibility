// Full pipeline smoke test: crawl → inference → probes → parse
// Run with: npx tsx scripts/test-pipeline.ts [url] [platform] [probe-limit]
//   url:         defaults to https://rentredi.com
//   platform:    openai | anthropic | google | perplexity | all (default: all)
//   probe-limit: max probes per platform, default 5 (use 0 for all)

import { config } from 'dotenv'
config({ path: '.env.local' })

import { crawlSite } from '../lib/crawler'
import { inferBusinessContext, generateProbes } from '../lib/inference'
import { probeOpenAI, probeAnthropic, probePerplexity, probeGoogle } from '../lib/inngest/probe-platform'
import type { Probe, ParsedProbeResult } from '../lib/db/types'
import Anthropic from '@anthropic-ai/sdk'

async function main() {
  const url = process.argv[2] ?? 'https://rentredi.com'
  const platform = process.argv[3] ?? 'all'
  const probeLimit = parseInt(process.argv[4] ?? '5') || Infinity

  console.log(`\n=== GEO Pipeline Test ===`)
  console.log(`URL: ${url}  |  Platforms: ${platform}  |  Probes per platform: ${probeLimit === Infinity ? 'all' : probeLimit}\n`)

  // Phase 2: Crawl + Inference
  console.log('1. Crawling...')
  const site = await crawlSite(url)
  console.log(`   ${site.pages.length} pages crawled\n`)

  console.log('2. Running business understanding...')
  const inference = await inferBusinessContext(site)
  console.log(`   ${inference.company_name} — ${inference.category}`)
  console.log(`   Competitors: ${inference.competitors.join(', ')}\n`)

  console.log('3. Generating probes...')
  const allGenerated = await generateProbes(inference)
  const generated = probeLimit < Infinity ? allGenerated.slice(0, probeLimit) : allGenerated
  console.log(`   ${generated.length} probes selected (of ${allGenerated.length} total)\n`)

  // Build in-memory probe records
  const platformsToRun = platform === 'all'
    ? (['openai', 'anthropic', 'google'] as const)
    : [platform as 'openai' | 'anthropic' | 'perplexity' | 'google']

  let idCounter = 0
  const store = new Map<string, Probe>()

  const probeRecords: Probe[] = generated.flatMap((p) =>
    platformsToRun.map((plt): Probe => {
      const id = `probe-${++idCounter}`
      const record: Probe = {
        id, report_id: 'test',
        prompt_text: p.prompt_text,
        prompt_type: p.prompt_type,
        platform: plt,
        response_text: null, parsed_json: null,
        citations: [], latency_ms: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      store.set(id, record)
      return record
    })
  )

  const onResult = async (id: string, update: Partial<Probe>) => {
    const existing = store.get(id)
    if (existing) store.set(id, { ...existing, ...update })
  }

  // Phase 3: Run probes per platform
  for (const plt of platformsToRun) {
    const platformProbes = probeRecords.filter((p) => p.platform === plt)
    console.log(`4. Running ${platformProbes.length} probes on ${plt}...`)
    const start = Date.now()

    if (plt === 'openai') await probeOpenAI(platformProbes, onResult)
    else if (plt === 'anthropic') await probeAnthropic(platformProbes, onResult)
    else if (plt === 'perplexity') await probePerplexity(platformProbes, onResult)
    else if (plt === 'google') await probeGoogle(platformProbes, onResult)

    const completed = [...store.values()].filter((p) => p.platform === plt && p.status === 'complete')
    console.log(`   ${completed.length}/${platformProbes.length} succeeded in ${((Date.now() - start) / 1000).toFixed(1)}s\n`)
  }

  // Parse responses
  console.log('5. Parsing responses with Claude Haiku...\n')
  const allProbes = [...store.values()]
  await parseProbeResponsesInMemory(allProbes, inference.company_name, onResult)

  // Show results grouped by prompt
  console.log('=== Results ===\n')
  const promptGroups = new Map<string, Probe[]>()
  for (const probe of [...store.values()]) {
    const existing = promptGroups.get(probe.prompt_text) ?? []
    existing.push(probe)
    promptGroups.set(probe.prompt_text, existing)
  }

  let totalMentioned = 0
  let totalParsed = 0

  for (const [prompt, probes] of promptGroups) {
    console.log(`PROMPT: ${prompt}`)
    console.log('─'.repeat(70))

    for (const probe of probes) {
      const r = probe.parsed_json as ParsedProbeResult | null
      if (r) {
        totalParsed++
        if (r.was_mentioned) totalMentioned++
      }

      const icon = r?.was_mentioned ? '✓' : '✗'
      const strength = r ? ` [${r.recommendation_strength}]` : ''
      console.log(`\n${icon} ${probe.platform.toUpperCase()}${strength}`)

      if (probe.response_text) {
        // Show first 400 chars of response
        const preview = probe.response_text.replace(/\n+/g, ' ').slice(0, 400)
        console.log(`   ${preview}${probe.response_text.length > 400 ? '...' : ''}`)
      }

      if (probe.citations?.length) {
        console.log(`   Citations: ${probe.citations.slice(0, 3).join(', ')}`)
      }

      if (r?.competitor_mentions?.length) {
        console.log(`   Competitors mentioned: ${r.competitor_mentions.join(', ')}`)
      }
    }
    console.log()
  }

  const mentionRate = totalParsed ? Math.round((totalMentioned / totalParsed) * 100) : 0
  console.log('='.repeat(70))
  console.log(`Mention rate: ${totalMentioned}/${totalParsed} (${mentionRate}%) — ${inference.company_name}`)
}

async function parseProbeResponsesInMemory(
  probes: Probe[],
  companyName: string,
  onResult: (id: string, update: Partial<Probe>) => Promise<void>
) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const eligible = probes.filter((p) => p.status === 'complete' && p.response_text)
  const BATCH_SIZE = 10

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE)
    const input = batch.map((p, idx) => ({
      index: idx, id: p.id,
      prompt: p.prompt_text,
      response: (p.response_text ?? '').slice(0, 2000),
    }))

    try {
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Brand name to look for: "${companyName}"

For each response below, extract:
- was_mentioned: true if the brand name appears anywhere
- mention_positions: if the response has a numbered/bulleted list of tools, which list position(s) (1-indexed) does the brand appear at. Empty array if no ranked list or not mentioned.
- recommendation_strength: "none" if not mentioned, "hedged" if mentioned with caveats, "confident" if recommended directly
- competitor_mentions: other brand/product names mentioned

Return JSON array only, no explanation:
[{"index":0,"was_mentioned":bool,"mention_positions":[],"recommendation_strength":"none","competitor_mentions":[]},...]

Input:
${JSON.stringify(input)}`,
        }],
      })
      const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
      const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
      const results = JSON.parse(jsonStr) as Array<{
        index: number; was_mentioned: boolean; mention_positions: number[]
        recommendation_strength: 'none' | 'hedged' | 'confident'; competitor_mentions: string[]
      }>

      for (const item of results) {
        const probe = batch[item.index]
        if (!probe) continue
        await onResult(probe.id, {
          parsed_json: {
            was_mentioned: item.was_mentioned,
            mention_positions: item.mention_positions ?? [],
            recommendation_strength: item.recommendation_strength ?? 'none',
            competitor_mentions: item.competitor_mentions ?? [],
            cited_urls: probe.citations ?? [],
            cited_domains: (probe.citations ?? []).flatMap((url: string) => {
              try { return [new URL(url).hostname.replace(/^www\./, '')] } catch { return [] }
            }),
            entity_confused: false,
            confused_with: null,
          },
        })
      }
    } catch (err) {
      console.error(`Parse batch failed:`, err)
    }
  }
}

main().catch(console.error)
