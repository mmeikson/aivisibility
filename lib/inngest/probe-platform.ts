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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---- OpenAI Responses API (gpt-4o + web_search_preview) ----

export async function probeOpenAI(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const date = new Date().toISOString().slice(0, 10)

  console.log(`[ChatGPT] using Responses API for ${probes.length} probes`)

  await Promise.all(probes.map(async (probe) => {
    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (client.responses.create as any)({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        instructions: `You are a helpful assistant. Today's date is ${date}. The user is located in the United States. When recommending products, services, or companies, default to US-based options unless otherwise specified.`,
        input: probe.prompt_text,
      })
      const text: string = res.output_text ?? ''
      if (!text.trim()) throw new Error('OpenAI Responses API returned empty response')

      const citations: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (res.output ?? []) as any[]) {
        for (const part of (item.content ?? [])) {
          for (const ann of (part.annotations ?? [])) {
            if (ann.type === 'url_citation' && ann.url) citations.push(ann.url)
          }
        }
      }

      await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      console.error(`OpenAI probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  }))
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

// ---- Google Gemini API with Google Search grounding ----

export async function probeGoogle(probes: Probe[], onResult: OnProbeResult): Promise<void> {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    // @ts-expect-error — googleSearch tool type not yet in SDK typedefs
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0 },
  })

  console.log(`[Gemini] using Gemini API for ${probes.length} probes`)

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
}
