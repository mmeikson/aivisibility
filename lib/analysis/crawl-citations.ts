import { fetchPage, fetchHomepageMeta } from '@/lib/crawler'

const MAX_URLS = 50
const CONCURRENCY = 5

function makeLimiter(concurrency: number) {
  let running = 0
  const queue: Array<() => void> = []
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      function run() {
        running++
        fn().then(resolve, reject).finally(() => {
          running--
          if (queue.length > 0) queue.shift()!()
        })
      }
      if (running < concurrency) run()
      else queue.push(run)
    })
  }
}

function jitter(minMs: number, maxMs: number): Promise<void> {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)))
}

// Crawl citation URLs and return page text snippets for Haiku classification.
// Returns url → text snippet (500 chars); absent entries mean the crawl failed.
export async function crawlCitationUrls(
  urls: Array<{ url: string; citationCount: number }>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  const sorted = [...urls].sort((a, b) => b.citationCount - a.citationCount).slice(0, MAX_URLS)
  if (sorted.length === 0) return results

  console.log(`[crawl-citations] crawling ${sorted.length} URLs (capped at ${MAX_URLS})`)

  const limit = makeLimiter(CONCURRENCY)
  await Promise.all(
    sorted.map(({ url }) =>
      limit(async () => {
        await jitter(150, 400)
        try {
          const page = await fetchPage(url)
          if (page.status === 'ok' && page.text.length > 0) {
            results.set(url, page.text)
          }
        } catch { /* ignore */ }
      })
    )
  )

  console.log(`[crawl-citations] done: ${results.size}/${sorted.length} crawled`)
  return results
}

const MAX_HOMEPAGES = 100

// Crawl the homepage of each domain so classifiers can identify the site's
// primary business, even when the cited URL is a blog post or resource page.
export async function crawlDomainHomepages(
  domains: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  if (domains.length === 0) return results

  const capped = domains.slice(0, MAX_HOMEPAGES)
  console.log(`[crawl-citations] fetching ${capped.length} homepages`)

  const limit = makeLimiter(CONCURRENCY)
  await Promise.all(
    capped.map((domain) =>
      limit(async () => {
        await jitter(100, 300)
        try {
          const meta = await fetchHomepageMeta(`https://${domain}`)
          if (meta) results.set(domain, meta)
        } catch { /* ignore */ }
      })
    )
  )

  console.log(`[crawl-citations] homepages: ${results.size}/${capped.length} fetched`)
  return results
}
