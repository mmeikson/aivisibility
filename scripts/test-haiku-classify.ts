import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BRAND = {
  name: 'RentRedi',
  domain: 'rentredi.com',
  category: 'property management software',
  description: 'landlord-tenant property management platform for rent collection, tenant screening, and maintenance',
  primaryUseCase: 'online rent collection, tenant screening, and maintenance management for independent landlords',
  targetCustomer: 'independent landlords and small property investors',
  competitors: ['TenantCloud', 'Avail', 'TurboTenant', 'Baselane', 'DoorLoop', 'Buildium', 'Innago'],
}

const domains = [
  { domain: 'appfolio.com', meta: "AppFolio: Move Beyond Property Management Software — Ditch yesterday's property management software. Learn how the AppFolio Performance Platform helps you deliver more value for residents, owners, and investors." },
  { domain: 'mrisoftware.com', meta: "MRI Software: Real Estate Solutions for Innovators — MRI Software offers innovative, open and connected technology for real estate owners, operators & occupiers." },
  { domain: 're-leased.com', meta: "Commercial Property Management Software | Re-Leased Global — Commercial property management software for property managers, landlords & owners globally." },
  { domain: 'magicdoor.com', meta: "Property Management Software | MagicDoor" },
  { domain: 'amerisave.com', meta: "Get Cash From Your Home. Low Rates. Quick Approval from AmeriSave. — Get a low-rate home equity loan or HELOC for anything you need." },
  { domain: 'store.plainspokenfoundrynine.com', meta: "Plainspoken Foundry Nine — Software That Works As Hard As You Do — 15 practical apps for manufacturing, property management, and operations teams." },
  { domain: 'rentana.io', meta: "AI-Powered Rent Optimization Software | Rentana — Reach our revenue goals with Rentana's powerful rent optimization software." },
]

const domainList = domains.map(({ domain, meta }, j) =>
  `${j}: ${domain}\n  Homepage: "${meta}"`
).join('\n\n')

const prompt = `Classify these domains cited in AI search results about ${BRAND.category} tools.

Brand being researched: "${BRAND.name}" (domain: ${BRAND.domain})
Description: ${BRAND.description}
Primary use case: ${BRAND.primaryUseCase}
Target customer: ${BRAND.targetCustomer}
Known direct competitors: ${BRAND.competitors.join(', ')}

"brand" — the domain's primary business is selling software that competes with "${BRAND.name}" in the same product category (${BRAND.primaryUseCase})
"review" — dedicated software review/comparison platform (G2, Capterra, Gartner, Trustpilot, etc.)
"editorial" — everything else including software that solves a DIFFERENT problem. When in doubt, use "editorial".

Domains:
${domainList}

Return a JSON array in index order: [{"sourceType": "editorial"}, ...]`

async function main() {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
  console.log('Haiku output:', text)
  const parsed = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))
  domains.forEach(({ domain }, j) => console.log(`${domain}: ${parsed[j]?.sourceType}`))
}
main().catch(console.error)
