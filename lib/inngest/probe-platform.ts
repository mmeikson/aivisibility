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

// ---- OpenAI (gpt-4o-search-preview, web search enabled) ----
// ChatGPT Plus has web browsing enabled by default — this models real user experience.
// Note: gpt-4o-search-preview does not support the temperature parameter.

export async function probeOpenAI(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  await Promise.all(probes.map(async (probe) => {
    const start = Date.now()
    try {
      const res = await client.chat.completions.create({
        model: 'gpt-4o-search-preview',
        messages: [{ role: 'user', content: probe.prompt_text }],
      })
      await onResult(probe.id, {
        response_text: res.choices[0]?.message?.content ?? '',
        citations: [],
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`OpenAI probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
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
        messages: [{ role: 'user', content: probe.prompt_text }],
      })
      const text = res.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
      await onResult(probe.id, {
        response_text: text,
        citations: [],
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Anthropic probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  }))
}

// ---- Perplexity (sonar-pro, live web retrieval) ----
// Already has web search built into the model
// Uses OpenAI-compatible API. Rate limited — add jitter between calls.

export async function probePerplexity(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
  })

  for (const probe of probes) {
    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (client.chat.completions.create as any)({
        model: 'sonar-reasoning-pro',
        messages: [
          { role: 'user', content: probe.prompt_text },
        ],
        max_tokens: 2048,
        temperature: 0,
      })
      const citedUrls: string[] = res.citations ?? []
      await onResult(probe.id, {
        response_text: res.choices?.[0]?.message?.content ?? '',
        citations: citedUrls,
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Perplexity probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
    // Throttle: 300–600ms between calls to stay within rate limits
    await sleep(300 + Math.random() * 300)
  }
}

// Resolve Google grounding redirect URLs to their actual source URLs
async function resolveGroundingUrls(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      if (!url.includes('vertexaisearch.cloud.google.com')) return url
      try {
        const res = await fetch(url, { method: 'HEAD', redirect: 'manual' })
        return res.headers.get('location') ?? url
      } catch {
        return url
      }
    })
  )
}

// ---- Google (gemini-2.5-pro with Google Search grounding) ----

export async function probeGoogle(probes: Probe[], onResult: OnProbeResult): Promise<void> {
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
      const candidates = result.response.candidates ?? []
      const citedUrls: string[] = candidates.flatMap((c) => {
        const chunks = c.groundingMetadata?.groundingChunks ?? []
        return chunks.flatMap((chunk: { web?: { uri?: string } }) =>
          chunk.web?.uri ? [chunk.web.uri] : []
        )
      })
      const resolvedUrls = await resolveGroundingUrls(citedUrls)
      await onResult(probe.id, {
        response_text: text,
        citations: resolvedUrls,
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Google probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  }))
}
