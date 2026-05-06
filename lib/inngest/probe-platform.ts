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

// Retries fn up to maxAttempts on 5xx and 429 errors with appropriate backoff.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, label = ''): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 429 && attempt < maxAttempts) {
        const headers = (err as { headers?: { get?: (k: string) => string | null } }).headers
        const retryMs = parseInt(headers?.get?.('retry-after-ms') ?? '0') || 1000
        const delay = retryMs + 200
        console.warn(`[retry] ${label} attempt ${attempt}/${maxAttempts} got 429, retrying in ${delay}ms`)
        await sleep(delay)
        lastErr = err
        continue
      }
      if (status && status >= 500 && status < 600 && attempt < maxAttempts) {
        const delay = 1000 * attempt
        console.warn(`[retry] ${label} attempt ${attempt}/${maxAttempts} got ${status}, retrying in ${delay}ms`)
        await sleep(delay)
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr
}

function timeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
  )
}

// Limits concurrent async tasks to `limit` at a time, with an optional stagger
// delay between each launch to avoid thundering-herd effects.
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  staggerMs: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  const queue = [...items.entries()]
  const workers = Array.from({ length: Math.min(limit, items.length) }, async (_, workerIndex) => {
    await sleep(workerIndex * staggerMs)
    while (queue.length > 0) {
      if (signal?.aborted) break
      const next = queue.shift()
      if (!next) break
      const [index, item] = next
      await fn(item, index)
    }
  })
  await Promise.all(workers)
}

// Wraps a promise so it rejects immediately when the AbortSignal fires.
function abortableRequest<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) }
    )
  })
}

// ---- Anthropic (claude-sonnet-4-6, no web search) ----
// Tests parametric knowledge from training data — what Claude "knows" about a brand.

const ANTHROPIC_CONCURRENCY = 8
const ANTHROPIC_STAGGER_MS  = 200
const ANTHROPIC_PROBE_TIMEOUT_MS = 45_000

export async function probeAnthropic(probes: Probe[], onResult: OnProbeResult, signal?: AbortSignal): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  await runWithConcurrency(probes, ANTHROPIC_CONCURRENCY, ANTHROPIC_STAGGER_MS, async (probe) => {
    const start = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(new Error(`Probe timeout after ${ANTHROPIC_PROBE_TIMEOUT_MS}ms`)), ANTHROPIC_PROBE_TIMEOUT_MS)
    if (signal) signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true })
    try {
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: `You are a helpful assistant. Today's date is ${new Date().toISOString().slice(0, 10)}. The user is located in the United States. When recommending products, services, or companies, default to US-based options and US pricing unless otherwise specified.`,
        messages: [{ role: 'user', content: probe.prompt_text }],
      }, { signal: ac.signal })
      const text = res.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
      if (!text.trim()) throw new Error('Anthropic returned empty response')
      await onResult(probe.id, { response_text: text, citations: [], latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      if (signal?.aborted) return
      console.error(`Anthropic probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    } finally {
      clearTimeout(timer)
    }
  }, signal)
}

// ---- OpenAI direct API (gpt-5.4, no web search) ----

export async function probeOpenAIDirect(probes: Probe[], onResult: OnProbeResult, signal?: AbortSignal): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const date = new Date().toISOString().slice(0, 10)

  const systemPrompt = `You are a careful, analytical assistant. Your goal is to produce responses that closely resemble high-quality ChatGPT outputs.

General behavior:
- Interpret the user's intent and adjust the response style accordingly (informational, analytical, recommendation, etc.).
- Prioritize correctness and reasoning over sounding helpful.
- If the question is underspecified, either ask a brief clarifying question or proceed with clearly stated assumptions.
- Be concise and structured; avoid unnecessary verbosity.

Specificity and content:
- Avoid generic boilerplate responses.
- Avoid unnecessary hyper-specific details (e.g., exact addresses, ratings, or obscure facts) unless explicitly requested.
- Do not invent facts, sources, or entities. If uncertain, omit or state uncertainty briefly.
- Prefer general explanations first; include examples only when they improve clarity.

Brand and entity mentions:
- When relevant, include real companies, brands, or entities as examples.
- Do not force brand mentions if they do not add value to the answer.
- Prefer well-known, widely recognized brands unless the context clearly calls for niche or regional ones.
- Limit the number of examples to a small, representative set.
- Only mention entities you are reasonably confident are real and relevant.

Reasoning quality:
- Highlight key assumptions, tradeoffs, or limitations when relevant.
- Challenge incorrect or questionable premises instead of accepting them.
- Avoid defaulting to "it depends" without explaining what it depends on.

Structure:
- Prefer short paragraphs over long lists.
- Use lists only when items are meaningfully distinct.
- Avoid long undifferentiated enumerations.

Final check before answering:
- Ensure the response is neither too generic nor artificially specific.
- Remove filler or content that could apply to almost any situation.
- Ensure any included examples or brands are relevant and add value.

Today's date is ${date}. The user is located in the United States.`

  console.log(`[ChatGPT-API] full parallel probes=${probes.length}`)

  const runProbe = async (probe: Probe) => {
    if (signal?.aborted) return
    const start = Date.now()
    try {
      const doCreate = () => client.chat.completions.create({
        model: 'gpt-5.4',
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: probe.prompt_text },
        ],
      }, { signal })
      const res = await withRetry(doCreate, 3, `ChatGPT-API ${probe.id}`)
      const text = res.choices?.[0]?.message?.content ?? ''
      if (!text.trim()) throw new Error('Empty response')
      await onResult(probe.id, { response_text: text, citations: [], latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      if (signal?.aborted) return
      console.error(`[ChatGPT-API] probe failed (${probe.id}):`, err)
      await onResult(probe.id, { status: 'failed' })
    }
  }

  await Promise.all(probes.map(runProbe))
}

// ---- Perplexity (sonar-pro, web-augmented with citations) ----
// Citations come back as a top-level `citations` array on the response object.

const PERPLEXITY_CONCURRENCY = 5
const PERPLEXITY_STAGGER_MS  = 300
const PERPLEXITY_PROBE_TIMEOUT_MS = 45_000

export async function probePerplexity(probes: Probe[], onResult: OnProbeResult, signal?: AbortSignal): Promise<void> {
  const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
  })
  const date = new Date().toISOString().slice(0, 10)

  console.log(`[Perplexity] sonar-pro concurrency=${PERPLEXITY_CONCURRENCY} probes=${probes.length}`)

  await runWithConcurrency(probes, PERPLEXITY_CONCURRENCY, PERPLEXITY_STAGGER_MS, async (probe) => {
    if (signal?.aborted) return
    const start = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(new Error(`Probe timeout after ${PERPLEXITY_PROBE_TIMEOUT_MS}ms`)), PERPLEXITY_PROBE_TIMEOUT_MS)
    if (signal) signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true })
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await withRetry(() => client.chat.completions.create({
        model: 'sonar-pro',
        temperature: 0,
        messages: [
          { role: 'system', content: `You are a helpful assistant. Today's date is ${date}. The user is located in the United States.` },
          { role: 'user', content: probe.prompt_text },
        ],
      } as Parameters<typeof client.chat.completions.create>[0], { signal: ac.signal }), 3, `Perplexity ${probe.id}`)

      const text: string = res.choices?.[0]?.message?.content ?? ''
      if (!text.trim()) throw new Error('Empty response')
      const citations: string[] = Array.isArray(res.citations) ? res.citations : []

      console.log(`[Perplexity] probe ${probe.id} latency=${Date.now() - start}ms citations=${citations.length}`)
      await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      if (signal?.aborted) return
      const status = (err as { status?: number })?.status
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Perplexity] probe failed (${probe.id}) status=${status ?? 'n/a'}: ${msg}`)
      await onResult(probe.id, { status: 'failed' })
    } finally {
      clearTimeout(timer)
    }
  }, signal)
}

// ---- Google direct API (gemini-2.5-flash with googleSearch grounding) ----
// Grounding redirect URLs are resolved to real URLs via HEAD request.

export async function probeGoogleDirect(probes: Probe[], onResult: OnProbeResult, signal?: AbortSignal): Promise<void> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set')
  const client = new GoogleGenerativeAI(apiKey)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} } as any],
  })
  const date = new Date().toISOString().slice(0, 10)
  console.log(`[Gemini-API] starting ${probes.length} probes`)
  await Promise.all(probes.map(async (probe) => {
    if (signal?.aborted) return
    const start = Date.now()
    try {
      const result = await Promise.race([
        abortableRequest(
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: probe.prompt_text }] }],
            systemInstruction: `You are a helpful assistant. Today's date is ${date}. The user is located in the United States.`,
            generationConfig: { temperature: 0 },
          }),
          signal
        ),
        timeout(45_000, `Gemini probe ${probe.id}`),
      ])
      const text = result.response.text()
      if (!text.trim()) throw new Error('Empty response')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawUrls: string[] = (result.response.candidates?.[0]?.groundingMetadata as any)
        ?.groundingChunks?.map((c: any) => c.web?.uri ?? '').filter(Boolean) ?? []
      const citations = await Promise.all(
        rawUrls.map(async (url) => {
          try {
            const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) })
            return r.url
          } catch { return url }
        })
      )
      console.log(`[Gemini-API] probe complete (${probe.id}) latency=${Date.now() - start}ms text_len=${text.length}`)
      await onResult(probe.id, { response_text: text, citations, latency_ms: Date.now() - start, status: 'complete' })
    } catch (err) {
      if (signal?.aborted) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any)?.status
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Gemini-API] probe failed (${probe.id}) status=${status ?? 'n/a'}: ${msg}`)
      await onResult(probe.id, { status: 'failed' })
    }
  }))
}
