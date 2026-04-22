import Anthropic from '@anthropic-ai/sdk'

export function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}
