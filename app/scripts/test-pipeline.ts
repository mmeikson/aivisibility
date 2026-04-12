// Full pipeline smoke test: crawl → inference → probes → parse
// Tests Phases 2 and 3 end-to-end without needing Supabase or Inngest
// Run with: npx tsx scripts/test-pipeline.ts [url] [platform]
//   url:      defaults to https://rentredi.com
//   platform: openai | anthropic | google | perplexity | all (default: anthropic)

import { config } from 'dotenv'
config({ path: '.env.local' })

import { crawlSite } from '../lib/crawler'
import { inferBusinessContext, generateProbes } from '../lib/inference'
import { probeOpenAI, probeAnthropic, probePerplexity, probeGoogle } from '../lib/inngest/probe-platform'
import { parseProbeResponses } from '../lib/parse-responses'
import type { Probe, ParsedProbeResult } from '../lib/db/types'

async function main() {
  const url = process.argv[2] ?? 'https://rentredi.com'
  const platform = process.argv[3] ?? 'anthropic'

  console.log(`\n=== GEO Pipeline Test ===`)
  console.log(`URL: ${url}  |  Platform: ${platform}\n`)

  // Phase 2: Crawl + Inference
  console.log('1. Crawling...')
  const site = await crawlSite(url)
  console.log(`   ${site.pages.length} pages crawled\n`)

  console.log('2. Running business understanding...')
  const inference = await inferBusinessContext(site)
  console.log(`   ${inference.company_name} — ${inference.category}`)
  console.log(`   Competitors: ${inference.competitors.join(', ')}\n`)

  console.log('3. Generating probes...')
  const generated = await generateProbes(inference)
  console.log(`   ${generated.length} probes generated\n`)

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

  // In-memory result handler (replaces updateProbe DB call)
  const onResult = async (id: string, update: Partial<Probe>) => {
    const existing = store.get(id)
    if (existing) store.set(id, { ...existing, ...update })
  }

  // Phase 3: Run probes
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

  // Parse responses — pass in-memory probes, use same in-memory onResult
  console.log('5. Parsing responses with Claude Haiku...')
  const allProbes = [...store.values()]

  // parseProbeResponses calls updateProbe internally — pass a patched version via closure
  // by temporarily overriding the module's updateProbe via the same callback pattern
  // Instead: inline the parse logic using the exported parseBatch indirectly
  await parseProbeResponsesInMemory(allProbes, inference.company_name, onResult)

  // Show results
  console.log('\n=== Results ===\n')
  const parsed = [...store.values()].filter((p) => p.parsed_json)
  let mentioned = 0

  for (const probe of parsed) {
    const r = probe.parsed_json as ParsedProbeResult
    if (r.was_mentioned) mentioned++
    const pos = r.mention_positions.length ? ` (pos: ${r.mention_positions.join(',')})` : ''
    const icon = r.was_mentioned ? '✓' : '✗'
    console.log(`${icon} [${probe.platform}] ${probe.prompt_text.slice(0, 65)}`)
    if (r.was_mentioned) console.log(`    → ${r.recommendation_strength}${pos}`)
  }

  const mentionRate = parsed.length ? Math.round((mentioned / parsed.length) * 100) : 0
  console.log(`\nMention rate: ${mentioned}/${parsed.length} (${mentionRate}%)`)
  console.log(`Brand: ${inference.company_name}`)
}

// Inline version of parseProbeResponses that uses the in-memory onResult
async function parseProbeResponsesInMemory(
  probes: Probe[],
  companyName: string,
  onResult: (id: string, update: Partial<Probe>) => Promise<void>
) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
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
          content: `Brand name: "${companyName}"\n\nFor each response, extract: was_mentioned (bool), mention_positions (int[]), recommendation_strength (none/hedged/confident), competitor_mentions (string[]).\n\nReturn JSON array only:\n[{"index":0,"was_mentioned":bool,"mention_positions":[],"recommendation_strength":"none","competitor_mentions":[]},...]  \n\nInput:\n${JSON.stringify(input)}`,
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
          },
        })
      }
    } catch (err) {
      console.error(`Parse batch failed:`, err)
    }
  }
}

main().catch(console.error)
