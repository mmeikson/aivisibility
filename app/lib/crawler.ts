import * as cheerio from 'cheerio'

export interface CrawlResult {
  url: string
  text: string
  status: 'ok' | 'failed'
}

export interface CrawledSite {
  baseUrl: string
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

async function fetchPage(url: string): Promise<CrawlResult> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GEOVisibilityBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      return { url, text: '', status: 'failed' }
    }

    const html = await res.text()
    const text = extractText(html)
    return { url, text, status: text.length > 50 ? 'ok' : 'failed' }
  } catch {
    return { url, text: '', status: 'failed' }
  }
}

export async function crawlSite(inputUrl: string): Promise<CrawledSite> {
  const base = new URL(inputUrl)
  const baseUrl = `${base.protocol}//${base.host}`

  // Pages to try, in priority order
  const pagePaths = ['/', '/about', '/about-us', '/pricing', '/product', '/features']

  const results = await Promise.all(
    pagePaths.map((path) => fetchPage(`${baseUrl}${path}`))
  )

  const pages = results.filter((r) => r.status === 'ok')

  return { baseUrl, pages }
}
