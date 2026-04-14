import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Probe } from '@/lib/db/types'

export type ProbeUpdate = {
  response_text?: string
  citations?: string[]
  latency_ms?: number
  status: 'complete' | 'failed'
}

export type OnProbeResult = (probeId: string, update: ProbeUpdate) => Promise<void>

// ---- Helpers ----

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
  )
}

// Limits concurrent async tasks to `limit` at a time, with an optional stagger
// delay between each launch to avoid thundering-herd on BD browser sessions.
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  staggerMs: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const queue = [...items.entries()]
  const workers = Array.from({ length: Math.min(limit, items.length) }, async (_, workerIndex) => {
    // Stagger worker start times
    await sleep(workerIndex * staggerMs)
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) break
      const [index, item] = next
      await fn(item, index)
    }
  })
  await Promise.all(workers)
}

// ---- Bright Data shared scraper ----
// Submits prompts to real AI web interfaces via browser automation.
// Concurrency is intentionally limited — running too many sessions simultaneously
// causes BD to return empty responses.

const BD_CHATGPT_ID = 'gd_m7aof0k82r803d5bjm'
const BD_GEMINI_ID  = 'gd_mbz66arm2mf9cu856y'

const BD_POLL_INTERVAL_MS = 5_000
const BD_MAX_POLLS = 36 // 3 min max per probe

async function brightDataScrape(
  datasetId: string,
  body: unknown,
  apiKey: string
): Promise<{ text: string; citations: string[] }> {
  const res = await fetch(
    `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${datasetId}&format=json`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()
  const first = Array.isArray(data) ? data[0] : data

  console.log(`[BD] dataset=${datasetId} status=${res.status} answer_text_len=${first?.answer_text?.length ?? 'n/a'}`)

  if (res.ok && first?.answer_text?.trim()) {
    return {
      text: first.answer_text,
      citations: (first.citations ?? []).map((c: { url?: string }) => c.url ?? '').filter(Boolean),
    }
  }

  // Async — poll snapshot
  const snapshotId: string = first?.snapshot_id
  if (!snapshotId) throw new Error(`Unexpected BD response: ${JSON.stringify(first).slice(0, 200)}`)

  for (let i = 0; i < BD_MAX_POLLS; i++) {
    await sleep(BD_POLL_INTERVAL_MS)
    const poll = await fetch(
      `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (poll.status === 202) continue
    const pollData = await poll.json()
    const result = Array.isArray(pollData) ? pollData[0] : pollData
    console.log(`[BD] snapshot=${snapshotId} poll_status=${poll.status} answer_text_len=${result?.answer_text?.length ?? 'n/a'}`)
    const text = result?.answer_text ?? ''
    if (!text.trim()) throw new Error(`BD snapshot ${snapshotId} returned empty response`)
    return {
      text,
      citations: (result.citations ?? []).map((c: { url?: string }) => c.url ?? '').filter(Boolean),
    }
  }

  throw new Error(`BD snapshot ${snapshotId} timed out`)
}

// ---- OpenAI via Bright Data (real ChatGPT browser session) ----
// BD can only sustain 1 concurrent session reliably — multiple simultaneous
// sessions cause the extras to return empty. Probes run strictly sequentially.
// Inngest will retry the step if it times out; already-completed probes are
// filtered out before calling these functions so retries make forward progress.

const BD_CONCURRENCY = 1
const BD_STAGGER_MS  = 0
const BD_TIMEOUT_MS  = 60_000

export async function probeOpenAI(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const bdKey = process.env.BRIGHTDATA_API_KEY
  if (!bdKey) throw new Error('BRIGHTDATA_API_KEY is required for ChatGPT probes')

  console.log(`[ChatGPT] BD concurrency=${BD_CONCURRENCY} stagger=${BD_STAGGER_MS}ms probes=${probes.length}`)

  await runWithConcurrency(probes, BD_CONCURRENCY, BD_STAGGER_MS, async (probe) => {
    const start = Date.now()
    try {
      const { text, citations } = await Promise.race([
        brightDataScrape(
          BD_CHATGPT_ID,
          [{ url: 'https://chatgpt.com/', prompt: probe.prompt_text, country: 'US' }],
          bdKey
        ),
        timeout(BD_TIMEOUT_MS, `ChatGPT probe ${probe.id}`),
      ])
      await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      console.warn(`[ChatGPT] probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  })
}

// ---- Anthropic (claude-sonnet-4-6, no web search) ----
// Tests parametric knowledge from training data — what Claude "knows" about a brand.

export async function probeAnthropic(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  await Promise.all(probes.map(async (probe) => {
    const start = Date.now()
    try {
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: `You are a helpful assistant. Today's date is ${new Date().toISOString().slice(0, 10)}. The user is located in the United States. When recommending products, services, or companies, default to US-based options and US pricing unless otherwise specified.`,
        messages: [{ role: 'user', content: probe.prompt_text }],
      })
      const text = res.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
      if (!text.trim()) throw new Error('Anthropic returned empty response')
      await onResult(probe.id, { response_text: text, citations: [], latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      console.error(`Anthropic probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  }))
}

// ---- Perplexity via sonar-pro API ----
// Uses the same model as the Perplexity Pro web experience.

export async function probePerplexity(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, baseURL: 'https://api.perplexity.ai' })
  const date = new Date().toISOString().slice(0, 10)

  for (const probe of probes) {
    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (client.chat.completions.create as any)({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant. Today's date is ${date}. The user is located in the United States.`,
          },
          { role: 'user', content: probe.prompt_text },
        ],
        max_tokens: 2048,
        temperature: 0,
      })
      const text = res.choices?.[0]?.message?.content ?? ''
      if (!text.trim()) throw new Error('Perplexity returned empty response')
      await onResult(probe.id, {
        response_text: text,
        citations: res.citations ?? [],
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Perplexity probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
    await sleep(300 + Math.random() * 300)
  }
}

// ---- Google via Bright Data (real Gemini browser session) ----
// Same concurrency/stagger/timeout strategy as ChatGPT.

export async function probeGoogle(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const bdKey = process.env.BRIGHTDATA_API_KEY
  if (!bdKey) throw new Error('BRIGHTDATA_API_KEY is required for Gemini probes')

  console.log(`[Gemini] BD concurrency=${BD_CONCURRENCY} stagger=${BD_STAGGER_MS}ms probes=${probes.length}`)

  await runWithConcurrency(probes, BD_CONCURRENCY, BD_STAGGER_MS, async (probe) => {
    const start = Date.now()
    try {
      const { text, citations } = await Promise.race([
        brightDataScrape(
          BD_GEMINI_ID,
          { input: [{ url: 'https://gemini.google.com/', prompt: probe.prompt_text, country: 'US', index: 1 }] },
          bdKey
        ),
        timeout(BD_TIMEOUT_MS, `Gemini probe ${probe.id}`),
      ])
      await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      console.warn(`[Gemini] probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  })
}
