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

  // Cap at ~5000 words — citation pages (roundup articles) can mention brands late in the text
  const words = text.split(' ')
  return words.slice(0, 5000).join(' ')
}

function extractMeta(html: string): string {
  const $ = cheerio.load(html)
  const parts: string[] = []
  const title = $('title').first().text().trim()
  const desc = $('meta[name="description"]').first().attr('content')?.trim()
    ?? $('meta[property="og:description"]').first().attr('content')?.trim()
  if (title && !title.toLowerCase().includes('just a moment')) parts.push(title)
  if (desc) parts.push(desc)
  return parts.join(' — ')
}

async function fetchDirectMeta(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const meta = extractMeta(await res.text())
    return meta.length > 20 ? meta : null
  } catch {
    return null
  }
}

function extractJinaMeta(jinaText: string): string {
  // Jina prefixes its output with "Title: ..." and optionally "Description: ..."
  const titleMatch = jinaText.match(/^Title:\s*(.+)/m)
  const descMatch = jinaText.match(/^Description:\s*(.+)/m)
  const parts: string[] = []
  if (titleMatch?.[1]) parts.push(titleMatch[1].trim())
  if (descMatch?.[1]) parts.push(descMatch[1].trim())
  return parts.length > 0 ? parts.join(' — ') : jinaText.slice(0, 800)
}

// Fetch a compact description of a homepage for classification purposes.
// Prefers <title> + <meta description> (server-rendered, always available);
// falls back to Jina for Cloudflare-protected or JS-only sites, extracting
// the title/description lines from Jina's structured output.
export async function fetchHomepageMeta(url: string): Promise<string | null> {
  const meta = await fetchDirectMeta(url)
  if (meta) return meta

  const jina = await fetchJina(url)
  return jina ? extractJinaMeta(jina) : null
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
      signal: AbortSignal.timeout(8_000),
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
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text.length > 200 ? text : null
  } catch {
    return null
  }
}

export async function fetchPage(url: string): Promise<CrawlResult> {
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
