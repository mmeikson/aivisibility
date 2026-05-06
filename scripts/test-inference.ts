// Quick smoke test: crawl a known site and run inference
// Run with: npx tsx scripts/test-inference.ts [url]

import { config } from 'dotenv'
config({ path: '.env.local' })

import { crawlSite } from '../lib/crawler'
import { inferAndGenerateProbes } from '../lib/inference'

async function main() {
  const url = process.argv[2] ?? 'https://linear.app'
  console.log(`\nCrawling ${url}...`)

  const site = await crawlSite(url)
  console.log(`Pages crawled: ${site.pages.length}`)
  site.pages.forEach((p) => console.log(`  ${p.url} — ${p.text.split(' ').length} words`))

  console.log('\nRunning business understanding + probe generation...')
  const { inference, probes } = await inferAndGenerateProbes(site)
  console.log('\nInference result:')
  console.log(JSON.stringify(inference, null, 2))

  console.log(`\nGenerated ${probes.length} probes:`)
  const byType = probes.reduce((acc: Record<string, number>, p) => {
    acc[p.prompt_type] = (acc[p.prompt_type] ?? 0) + 1
    return acc
  }, {})
  console.log('  By type:', byType)
  probes.forEach((p) => console.log(`  [${p.prompt_type}] ${p.prompt_text}`))
}

main().catch(console.error)
