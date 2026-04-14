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

// ---- Bright Data shared scraper ----
// Submits prompts to real AI web interfaces, capturing responses identical to
// what users actually see. Handles both sync and async (snapshot polling) responses.

const BD_POLL_INTERVAL_MS = 5000
const BD_MAX_POLLS = 36 // 3 minutes max

const BD_CHATGPT_ID = 'gd_m7aof0k82r803d5bjm'
const BD_GEMINI_ID = 'gd_mbz66arm2mf9cu856y'
const BD_PERPLEXITY_ID = 'gd_m7dhdot1vw9a7gc1n'

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

  console.log(`[BD] dataset=${datasetId} status=${res.status} keys=${Object.keys(first ?? {}).join(',')} answer_text_len=${first?.answer_text?.length ?? 'n/a'}`)

  // Sync result
  if (res.ok && first?.answer_text?.trim()) {
    return {
      text: first.answer_text,
      citations: (first.citations ?? []).map((c: { url?: string }) => c.url ?? '').filter(Boolean),
    }
  }

  // Async — poll snapshot until ready
  const snapshotId: string = first?.snapshot_id
  if (!snapshotId) throw new Error(`Unexpected Bright Data response: ${JSON.stringify(first).slice(0, 200)}`)

  for (let i = 0; i < BD_MAX_POLLS; i++) {
    await sleep(BD_POLL_INTERVAL_MS)
    const poll = await fetch(
      `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (poll.status === 202) continue
    const pollData = await poll.json()
    const result = Array.isArray(pollData) ? pollData[0] : pollData
    console.log(`[BD] poll snapshot=${snapshotId} poll_status=${poll.status} keys=${Object.keys(result ?? {}).join(',')} answer_text_len=${result?.answer_text?.length ?? 'n/a'}`)
    const text = result?.answer_text ?? ''
    if (!text.trim()) throw new Error(`Bright Data snapshot ${snapshotId} returned empty response`)
    return {
      text,
      citations: (result.citations ?? []).map((c: { url?: string }) => c.url ?? '').filter(Boolean),
    }
  }

  throw new Error(`Bright Data snapshot ${snapshotId} timed out`)
}

// ---- OpenAI via Bright Data (real ChatGPT browser session) ----
// API alternatives (gpt-4o-search-preview, Responses API) produce materially
// different results from the desktop client — BD is the only reliable match.

const BD_RETRIES = 2

export async function probeOpenAI(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const bdKey = process.env.BRIGHTDATA_API_KEY
  if (!bdKey) throw new Error('BRIGHTDATA_API_KEY is required for ChatGPT probes')

  console.log(`[ChatGPT] using Bright Data for ${probes.length} probes`)

  await Promise.all(probes.map(async (probe) => {
    const start = Date.now()
    let lastErr: unknown
    for (let attempt = 0; attempt < BD_RETRIES; attempt++) {
      try {
        const { text, citations } = await Promise.race([
          brightDataScrape(
            BD_CHATGPT_ID,
            [{ url: 'https://chatgpt.com/', prompt: probe.prompt_text, country: 'US' }],
            bdKey
          ),
          timeout(90_000, `ChatGPT BD probe ${probe.id} attempt ${attempt + 1}`),
        ])
        await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
        return
      } catch (err) {
        lastErr = err
        console.warn(`ChatGPT BD attempt ${attempt + 1} failed (${probe.id}):`, err)
      }
    }
    console.error(`ChatGPT probe exhausted all attempts (${probe.id}):`, lastErr)
    await onResult(probe.id, { status: 'failed' })
  }))
}

// ---- Anthropic (claude-sonnet-4-6, no web search) ----
// Tests parametric knowledge from training data — what Claude "knows" about a brand.
// Web search would override training knowledge with current results, diverging from
// typical Claude behavior on recommendation queries.

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
// Falls back to Gemini API with Google Search grounding if BRIGHTDATA_API_KEY is not set.

export async function probeGoogle(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const bdKey = process.env.BRIGHTDATA_API_KEY

  // Fallback: Gemini API with grounding
  if (!bdKey) {
    const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
    const model = genai.getGenerativeModel({
      model: 'gemini-2.5-pro',
      // @ts-expect-error — googleSearch tool type not yet in SDK typedefs
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0 },
    })
    await Promise.all(probes.map(async (probe) => {
      const start = Date.now()
      try {
        const result = await model.generateContent(probe.prompt_text)
        const text = result.response.text()
        if (!text.trim()) throw new Error('Google returned empty response')
        const candidates = result.response.candidates ?? []
        const citedUrls: string[] = candidates.flatMap((c) => {
          const chunks = c.groundingMetadata?.groundingChunks ?? []
          return chunks.flatMap((chunk: { web?: { uri?: string } }) =>
            chunk.web?.uri ? [chunk.web.uri] : []
          )
        })
        await onResult(probe.id, { response_text: text, citations: citedUrls, latency_ms: Date.now() - start, status: 'complete' })
      } catch (err) {
        console.error(`Google probe failed (${probe.id}):`, err)
        await onResult(probe.id, { status: 'failed' })
      }
    }))
    return
  }

  await Promise.all(probes.map(async (probe) => {
    const start = Date.now()
    try {
      const { text, citations } = await Promise.race([
        brightDataScrape(
          BD_GEMINI_ID,
          { input: [{ url: 'https://gemini.google.com/', prompt: probe.prompt_text, country: 'US', index: 1 }] },
          bdKey
        ),
        timeout(90_000, `Gemini probe ${probe.id}`),
      ])
      await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      console.error(`Google (Bright Data) probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  }))
}
