import { fetchHomepageMeta } from '@/lib/crawler'
import Anthropic from '@anthropic-ai/sdk'

// Domains with suspicious classifications from the RentRedi report
const MISCLASSIFIED = [
  'appfolio.com',        // showing Editorial — should be Brand
  'mrisoftware.com',     // showing Editorial — should be Brand  
  'renttrack.com',       // showing Editorial — should be Brand
  're-leased.com',       // showing Editorial — should be Brand
  'magicdoor.com',       // showing Editorial — likely Brand
  'amerisave.com',       // showing Editorial — correct?
  'wise.com',            // showing Editorial — correct?
  'store.plainspokenfoundrynine.com', // showing Brand — clearly wrong
  'rentana.io',          // showing Brand — unknown domain
]

// RentRedi's inferred context (approximate)
const BRAND = {
  name: 'RentRedi',
  domain: 'rentredi.com',
  category: 'property management software',
  description: 'landlord-tenant property management platform for rent collection, tenant screening, and maintenance',
  primaryUseCase: 'online rent collection, tenant screening, and maintenance management for independent landlords',
  targetCustomer: 'independent landlords and small property investors',
  competitors: ['TenantCloud', 'Avail', 'TurboTenant', 'Baselane', 'DoorLoop', 'Buildium', 'Innago'],
}

async function main() {
  console.log('=== STEP 1: Homepage meta retrieval ===\n')
  const snippets: Record<string, string | null> = {}
  for (const domain of MISCLASSIFIED) {
    const meta = await fetchHomepageMeta(`https://${domain}`)
    snippets[domain] = meta
    console.log(`${domain}:\n  ${meta ? `"${meta.slice(0, 120)}"` : 'NULL — would be unknown'}\n`)
  }

  const withMeta = MISCLASSIFIED.filter(d => snippets[d])
  if (withMeta.length === 0) { console.log('No domains have meta — all would be unknown'); return }

  console.log('\n=== STEP 2: What Haiku receives ===\n')
  const domainList = withMeta.map((domain, j) => {
    const lines = [`${j}: ${domain}`]
    lines.push(`  Homepage: "${snippets[domain]!.slice(0, 600)}"`)
    return lines.join('\n')
  }).join('\n\n')

  const prompt = `Classify these domains cited in AI search results about ${BRAND.category} tools.

Brand being researched: "${BRAND.name}" (domain: ${BRAND.domain})
Description: ${BRAND.description}
Primary use case: ${BRAND.primaryUseCase}
Target customer: ${BRAND.targetCustomer}
Known direct competitors: ${BRAND.competitors.join(', ')}

"brand" — the domain's primary business is selling software that competes with "${BRAND.name}" in the same product category (${BRAND.primaryUseCase})...
"review" — dedicated software review/comparison platform (G2, Capterra, Gartner, Trustpilot, etc.)
"editorial" — everything else: media, news, blogs, communities, analyst firms, agencies, consultants, and software companies that solve a DIFFERENT problem (e.g. CRM, analytics, cloud infrastructure, HR, finance) even if used by the same type of customer. When in doubt, use "editorial".

Domains:
${domainList}

Return a JSON array in index order: [{"sourceType": "editorial"}, ...]`

  console.log('Prompt excerpt (domain list):')
  console.log(domainList)

  console.log('\n=== STEP 3: Haiku output ===\n')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
  console.log(text)

  const parsed = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))
  console.log('\n=== VERDICT ===\n')
  withMeta.forEach((domain, j) => {
    console.log(`${domain}: ${parsed[j]?.sourceType ?? 'parse error'}`)
  })
}

main().catch(console.error)
