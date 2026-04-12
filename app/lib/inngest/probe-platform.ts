import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { updateProbe } from '@/lib/db/queries'
import type { Probe } from '@/lib/db/types'

// ---- Helpers ----

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

// ---- OpenAI (gpt-4o, no retrieval) ----

export async function probeOpenAI(probes: Probe[]): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  for (const probe of probes) {
    const start = Date.now()
    try {
      const res = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: probe.prompt_text }],
        max_tokens: 1024,
      })
      await updateProbe(probe.id, {
        response_text: res.choices[0]?.message?.content ?? '',
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`OpenAI probe failed (${probe.id}):`, err)
      await updateProbe(probe.id, { status: 'failed' })
    }
  }
}

// ---- Anthropic (claude-sonnet-4-6, no retrieval) ----

export async function probeAnthropic(probes: Probe[]): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  for (const probe of probes) {
    const start = Date.now()
    try {
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: probe.prompt_text }],
      })
      const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
      await updateProbe(probe.id, {
        response_text: text,
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Anthropic probe failed (${probe.id}):`, err)
      await updateProbe(probe.id, { status: 'failed' })
    }
  }
}

// ---- Perplexity (sonar-pro, live web retrieval) ----
// Uses OpenAI-compatible API. Rate limited — max 5 concurrent, add jitter between calls.

export async function probePerplexity(probes: Probe[]): Promise<void> {
  const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
  })

  for (const probe of probes) {
    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (client.chat.completions.create as any)({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: probe.prompt_text }],
        max_tokens: 1024,
      })

      const text = res.choices?.[0]?.message?.content ?? ''
      // Perplexity returns citations as a top-level array on the response object
      const citedUrls: string[] = res.citations ?? []

      await updateProbe(probe.id, {
        response_text: text,
        citations: citedUrls,
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Perplexity probe failed (${probe.id}):`, err)
      await updateProbe(probe.id, { status: 'failed' })
    }

    // Throttle: 300–600ms between Perplexity calls to stay within rate limits
    await sleep(300 + Math.random() * 300)
  }
}

// ---- Google (gemini-2.5-flash with Google Search grounding) ----

export async function probeGoogle(probes: Probe[]): Promise<void> {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    // @ts-expect-error — googleSearch tool type not yet in SDK typedefs
    tools: [{ googleSearch: {} }],
  })

  for (const probe of probes) {
    const start = Date.now()
    try {
      const result = await model.generateContent(probe.prompt_text)
      const text = result.response.text()

      // Extract cited URLs from grounding metadata
      const candidates = result.response.candidates ?? []
      const citedUrls: string[] = candidates.flatMap((c) => {
        const chunks = c.groundingMetadata?.groundingChunks ?? []
        return chunks.flatMap((chunk: { web?: { uri?: string } }) =>
          chunk.web?.uri ? [chunk.web.uri] : []
        )
      })

      await updateProbe(probe.id, {
        response_text: text,
        citations: citedUrls,
        latency_ms: Date.now() - start,
        status: 'complete',
      })
    } catch (err) {
      console.error(`Google probe failed (${probe.id}):`, err)
      await updateProbe(probe.id, { status: 'failed' })
    }
  }
}
