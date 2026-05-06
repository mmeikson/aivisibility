import type { Probe } from '@/lib/db/types'
import { classifyDomainsWithHaiku } from './classify-sources'
import { crawlCitationUrls, crawlDomainHomepages } from './crawl-citations'

export const SOURCE_GAP_VERSION = 7

const STRIP_DOMAINS = new Set([
  'vertexaisearch.cloud.google.com',
])

function probeUrls(probe: Probe): string[] {
  const raw = probe.citations.length > 0 ? probe.citations : (probe.parsed_json?.cited_urls ?? [])
  return raw.filter((url) => {
    try {
      const host = new URL(url).hostname
      return !STRIP_DOMAINS.has(host)
    } catch { return false }
  })
}

export type SourceType = 'brand' | 'review' | 'editorial' | 'unknown'

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  brand:     'Brand',
  review:    'Review',
  editorial: 'Editorial',
  unknown:   'Unknown',
}

export const SOURCE_TYPE_COLOR: Record<SourceType, string> = {
  brand:     '#F87171',
  review:    '#34D399',
  editorial: '#94A3B8',
  unknown:   '#D1D5DB',
}

export interface DomainEntry {
  domain: string
  sourceType: SourceType
  citedInProbeCount: number
  totalProbes: number
  citationRate: number
  platformNames: string[]
  brandMentioned: boolean | null
  isGap: boolean
  sampleUrls: string[]
}

export interface CitedDomainSummary {
  domain: string
  sourceType: SourceType
  citedInProbeCount: number
  brandMentioned: boolean | null
  sampleUrls: string[]
  homepageSnippet?: string
}

export interface CitationSummary {
  citedDomains: CitedDomainSummary[]
}

export interface SourceGapResult {
  byType: Record<SourceType, DomainEntry[]>
  totalProbes: number
  hasAnyData: boolean
  citationSummary: CitationSummary
  version?: number
}

export async function computeSourceGaps(
  probes: Probe[],
  competitors: string[] = [],
  ownDomain = '',
  brandName = '',
  category = '',
  brandDescription = '',
  primaryUseCase = '',
  targetCustomer = '',
): Promise<SourceGapResult> {
  const empty: SourceGapResult = {
    byType: { brand: [], review: [], editorial: [], unknown: [] },
    totalProbes: 0,
    hasAnyData: false,
    citationSummary: { citedDomains: [] },
  }

  // Only unbranded probes — branded queries skew citations toward own/competitor pages
  const UNBRANDED_TYPES = new Set(['discovery', 'job_to_be_done', 'ranking', 'comparison'])
  const eligibleProbes = probes.filter(
    (p) => UNBRANDED_TYPES.has(p.prompt_type) && probeUrls(p).length > 0
  )
  if (eligibleProbes.length === 0) return empty

  // ── Phase 1: aggregate domain stats ──────────────────────────────────────

  const domainMap = new Map<string, {
    probeIds: Set<string>
    platformNames: Set<string>
    urlSet: Set<string>
  }>()

  const urlCitationCount = new Map<string, number>()

  for (const probe of eligibleProbes) {
    const urls = probeUrls(probe)
    const seenDomains = new Set<string>()

    for (const url of urls) {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '')
        if (!domainMap.has(domain)) {
          domainMap.set(domain, { probeIds: new Set(), platformNames: new Set(), urlSet: new Set() })
        }
        const entry = domainMap.get(domain)!
        if (!seenDomains.has(domain)) {
          entry.probeIds.add(probe.id)
          seenDomains.add(domain)
        }
        entry.platformNames.add(probe.platform)
        entry.urlSet.add(url)
        urlCitationCount.set(url, (urlCitationCount.get(url) ?? 0) + 1)
      } catch { /* ignore malformed URL */ }
    }
  }

  // ── Phase 2: crawl citation URLs for page text + domain homepages ────────

  const urlsForCrawl = Array.from(urlCitationCount.entries())
    .map(([url, citationCount]) => ({ url, citationCount }))

  // Sort domains by probe citation count so the cap hits least-cited domains last
  const allDomains = Array.from(domainMap.entries())
    .sort((a, b) => b[1].probeIds.size - a[1].probeIds.size)
    .map(([domain]) => domain)

  const [crawledText, homepageTexts] = brandName
    ? await Promise.all([
        crawlCitationUrls(urlsForCrawl),
        crawlDomainHomepages(allDomains),
      ])
    : [new Map<string, string>(), new Map<string, string>()]

  // ── Phase 3: classify domains with Haiku ─────────────────────────────────

  // Software review aggregators are universal across all product/service categories.
  // Matching is done on the root domain (eTLD+1) so subdomains are covered automatically.
  const KNOWN_REVIEW_DOMAINS = new Set([
    'g2.com', 'capterra.com', 'gartner.com', 'trustpilot.com', 'getapp.com',
    'softwareadvice.com', 'sourceforge.net', 'tekpon.com', 'getapp.co',
    'peerspot.com', 'crozdesk.com', 'slashdot.org', 'serchen.com',
  ])

  // Strip subdomain to match root domain (e.g. en.wikipedia.org → wikipedia.org)
  function rootDomain(d: string): string {
    const parts = d.split('.')
    return parts.length > 2 ? parts.slice(-2).join('.') : d
  }

  const preClassified = new Map<string, { sourceType: SourceType }>()
  const needsHaiku: Array<{ domain: string; homepageSnippet: string }> = []

  for (const domain of domainMap.keys()) {
    const root = rootDomain(domain)
    if (domain === ownDomain || root === rootDomain(ownDomain)) {
      preClassified.set(domain, { sourceType: 'brand' })
    } else if (KNOWN_REVIEW_DOMAINS.has(root)) {
      preClassified.set(domain, { sourceType: 'review' })
    } else {
      const snippet = homepageTexts.get(domain)
      if (snippet) {
        needsHaiku.push({ domain, homepageSnippet: snippet })
      }
      // No snippet → sourceType stays absent; will resolve to 'unknown' below
    }
  }

  const haikuClassifications = brandName && needsHaiku.length > 0
    ? await classifyDomainsWithHaiku(needsHaiku, brandName, ownDomain, category, competitors, brandDescription, primaryUseCase, targetCustomer)
    : new Map<string, { sourceType: SourceType }>()

  const classifications = new Map<string, { sourceType: SourceType }>([
    ...preClassified,
    ...haikuClassifications,
  ])

  // ── Phase 4: build DomainEntry[] ─────────────────────────────────────────

  const total = eligibleProbes.length
  const byType: Record<SourceType, DomainEntry[]> = { brand: [], review: [], editorial: [], unknown: [] }

  for (const [domain, acc] of domainMap.entries()) {
    const citedInProbeCount = acc.probeIds.size
    const platformNames = Array.from(acc.platformNames)
    const sampleUrls = Array.from(acc.urlSet).slice(0, 5)

    const sourceType: SourceType = classifications.get(domain)?.sourceType ?? 'unknown'

    // brandMentioned: mechanical keyword search on crawled citation pages
    let brandMentioned: boolean | null = null
    const brandLower = brandName.toLowerCase()

    for (const url of acc.urlSet) {
      const text = crawledText.get(url)
      if (text !== undefined) {
        if (brandMentioned === null) brandMentioned = false
        if (text.toLowerCase().includes(brandLower) || url.toLowerCase().includes(brandLower)) {
          brandMentioned = true
          break
        }
      }
    }

    const isGap = sourceType !== 'brand' && brandMentioned === false && citedInProbeCount >= 2

    byType[sourceType].push({
      domain,
      sourceType,
      citedInProbeCount,
      totalProbes: total,
      citationRate: citedInProbeCount / total,
      platformNames,
      brandMentioned,
      isGap,
      sampleUrls,
    })
  }

  for (const entries of Object.values(byType)) {
    entries.sort((a, b) => b.citedInProbeCount - a.citedInProbeCount)
  }

  // ── citationSummary for recommendations ──────────────────────────────────
  // Include ALL cited domains — Sonnet will identify competitors inline
  // and exclude them from action steps rather than relying on pre-classification.

  const allEntries = Object.values(byType).flat()
  const citationSummary: CitationSummary = {
    citedDomains: allEntries
      .sort((a, b) => b.citedInProbeCount - a.citedInProbeCount)
      .map(e => ({
        domain: e.domain,
        sourceType: e.sourceType,
        citedInProbeCount: e.citedInProbeCount,
        brandMentioned: e.brandMentioned,
        sampleUrls: e.sampleUrls,
        homepageSnippet: homepageTexts.get(e.domain),
      })),
  }

  const hasAnyData = Object.values(byType).some((arr) => arr.length > 0)
  return { byType, totalProbes: total, hasAnyData, citationSummary, version: SOURCE_GAP_VERSION }
}
