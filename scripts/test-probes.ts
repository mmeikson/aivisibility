// Smoke test: run a single prompt against each platform directly
// Run with: npx tsx scripts/test-probes.ts [openai|anthropic|google]

import { config } from 'dotenv'
config({ path: '.env.local' })

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const PROMPT = 'What are the best property management software tools for independent landlords?'

async function testOpenAI() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const start = Date.now()
  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: PROMPT }],
    max_tokens: 512,
  })
  console.log(`Latency: ${Date.now() - start}ms`)
  console.log(res.choices[0]?.message?.content?.slice(0, 400))
}

async function testAnthropic() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const start = Date.now()
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: PROMPT }],
  })
  console.log(`Latency: ${Date.now() - start}ms`)
  const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
  console.log(text.slice(0, 400))
}

async function testGoogle() {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    // @ts-expect-error — googleSearch tool type not yet in SDK typedefs
    tools: [{ googleSearch: {} }],
  })
  const start = Date.now()
  const result = await model.generateContent(PROMPT)
  console.log(`Latency: ${Date.now() - start}ms`)
  console.log(result.response.text().slice(0, 400))
  const chunks = result.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  if (chunks.length) console.log(`Citations (${chunks.length}):`, chunks.slice(0, 3).map((c: { web?: { uri?: string } }) => c.web?.uri))
}

async function main() {
  const platform = process.argv[2] ?? 'all'
  const run = async (name: string, fn: () => Promise<void>) => {
    console.log(`\n--- ${name} ---`)
    try { await fn() } catch (e) { console.error('Error:', e) }
  }

  if (platform === 'all' || platform === 'openai') await run('OpenAI (gpt-4o)', testOpenAI)
  if (platform === 'all' || platform === 'anthropic') await run('Anthropic (claude-sonnet-4-6)', testAnthropic)
  if (platform === 'all' || platform === 'google') await run('Google (gemini-2.5-flash)', testGoogle)
}

main().catch(console.error)
