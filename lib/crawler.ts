import * as cheerio from 'cheerio'

export interface CrawlResult {
  url: string
  text: string
  status: 'ok' | 'failed'
}

export interface CrawledSite {
  baseUrl: string
  inputUrl: string
  pages: CrawlResult[]
}

// Tags whose content is boilerplate — strip entirely
const STRIP_SELECTORS = [
  'nav', 'header', 'footer',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.nav', '.navbar', '.header', '.footer', '.menu', '.sidebar',
  '#nav', '#header', '#footer', '#menu', '#sidebar',
  '.cookie-banner', '.cookie-notice', '#cookie-banner',
  '.announcement', '.alert-banner', '.notification-bar',
  'script', 'style', 'noscript', 'iframe', 'svg',
]

function extractText(html: string): string {
  const $ = cheerio.load(html)

  // Remove boilerplate
  STRIP_SELECTORS.forEach((sel) => $(sel).remove())

  // Get visible text, collapse whitespace
  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Cap at ~2500 words to stay within token budgets
  const words = text.split(' ')
  return words.slice(0, 2500).join(' ')
}

async function fetchDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = extractText(html)
    return text.length > 200 ? text : null
  } catch {
    return null
  }
}

// Jina Reader renders JS-heavy pages and returns clean text — used as fallback
async function fetchJina(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text.length > 200 ? text.slice(0, 10_000) : null
  } catch {
    return null
  }
}

async function fetchPage(url: string): Promise<CrawlResult> {
  const direct = await fetchDirect(url)
  if (direct) return { url, text: direct, status: 'ok' }

  // Direct fetch returned too little — JS-rendered site, try Jina
  const jina = await fetchJina(url)
  if (jina) return { url, text: jina, status: 'ok' }

  return { url, text: '', status: 'failed' }
}

export async function crawlSite(inputUrl: string): Promise<CrawledSite> {
  const base = new URL(inputUrl)
  const baseUrl = `${base.protocol}//${base.host}`
  const productPath = base.pathname.replace(/\/$/, '') // e.g. "/software/jira"

  // If the submitted URL has a meaningful path (product page within a larger site),
  // prioritise crawling that product's own pages rather than the root domain.
  const hasProductPath = productPath.length > 1

  const pagePaths = hasProductPath
    ? [
        productPath,
        `${productPath}/pricing`,
        `${productPath}/features`,
        `${productPath}/product`,
        '/',
        '/about',
      ]
    : ['/', '/about', '/about-us', '/pricing', '/product', '/features']

  const results = await Promise.all(
    pagePaths.map((path) => fetchPage(`${baseUrl}${path}`))
  )

  const pages = results.filter((r) => r.status === 'ok')

  return { baseUrl, pages, inputUrl }
}
