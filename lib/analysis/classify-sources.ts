import Anthropic from '@anthropic-ai/sdk'
import type { SourceType } from './source-gaps'

export interface DomainClassification {
  sourceType: SourceType
}

const BATCH_SIZE = 60

export async function classifyDomainsWithHaiku(
  items: Array<{ domain: string; homepageSnippet: string }>,
  brandName: string,
  brandDomain: string,
  category: string,
  competitors: string[],
  brandDescription = '',
  primaryUseCase = '',
  targetCustomer = '',
): Promise<Map<string, DomainClassification>> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const results = new Map<string, DomainClassification>()

  console.log(`[classify-sources] classifying ${items.length} domains with Haiku (${Math.ceil(items.length / BATCH_SIZE)} batch${items.length > BATCH_SIZE ? 'es' : ''})`)

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const domainList = batch.map(({ domain, homepageSnippet }, j) => {
      const lines: string[] = [`${j}: ${domain}`]
      lines.push(`  Homepage: "${homepageSnippet.slice(0, 600)}"`)
      return lines.join('\n')
    }).join('\n\n')

    try {
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Classify these domains cited in AI search results about ${category} tools.

Brand being researched: "${brandName}" (domain: ${brandDomain})
${brandDescription ? `Description: ${brandDescription}` : ''}${primaryUseCase ? `\nPrimary use case: ${primaryUseCase}` : ''}${targetCustomer ? `\nTarget customer: ${targetCustomer}` : ''}
Known direct competitors: ${competitors.join(', ')}

Classify each domain into exactly one of these four types:

"brand" — the domain's primary business sells products or services that compete with or are adjacent to "${brandName}" in the same market (${primaryUseCase || category}). Includes direct competitors and adjacent sub-markets (e.g. a contact lens retailer is "brand" for an eyewear brand; a commercial property management tool is "brand" for a residential one).

"review" — the domain is a third-party platform whose primary purpose is aggregating user ratings and reviews across many brands or products (e.g. G2, Yelp, Trustpilot, TripAdvisor, Consumer Reports, Capterra). Price comparison sites, affiliate listicles, and single-brand review pages do NOT qualify.

"editorial" — media outlets, news sites, blogs, forums, social platforms, communities, analyst reports, agencies, app stores, and any business whose primary activity is publishing content rather than selling a competing product or aggregating reviews.

"unknown" — the homepage snippet is too short, generic, or ambiguous to classify confidently. Use this rather than guessing.

Domains:
${domainList}

Return a JSON array in index order, one entry per domain:
[{"sourceType": "editorial"}, ...]`,
        }],
      })

      const text = res.content[0]?.type === 'text' ? res.content[0].text : '[]'
      const start = text.indexOf('[')
      const end = text.lastIndexOf(']')
      if (start === -1 || end === -1) throw new Error(`No JSON array in response: ${text.slice(0, 200)}`)
      const parsed = JSON.parse(text.slice(start, end + 1)) as Array<{ sourceType: SourceType }>

      console.log(`[classify-sources] batch ${Math.floor(i / BATCH_SIZE) + 1}: classified ${parsed.length}/${batch.length} domains`)
      for (let j = 0; j < batch.length; j++) {
        const c = parsed[j]
        results.set(batch[j].domain, { sourceType: c?.sourceType ?? 'unknown' })
      }
    } catch (err) {
      console.error(`[classify-sources] batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err instanceof Error ? err.message : err)
      for (const { domain } of batch) {
        results.set(domain, { sourceType: 'unknown' })
      }
    }
  }

  return results
}
