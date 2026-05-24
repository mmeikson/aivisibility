'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import type { DomainEntry } from '@/lib/analysis/source-gaps'
import { SOURCE_TYPE_LABELS, SOURCE_TYPE_COLOR } from '@/lib/analysis/source-gaps'

export const PLATFORM_LABELS: Record<string, string> = {
  openai: 'GPT',
  perplexity: 'Perplexity',
  anthropic: 'Claude',
  google: 'Gemini',
}

export const COL = {
  type:      'w-[90px]  shrink-0',
  platforms: 'w-[148px] shrink-0',
  count:     'w-[52px]  shrink-0 text-right',
  chevron:   'w-4       shrink-0',
}

export function DomainTableHeader() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#F7F6F3] border-b border-[#E5E2DC]">
      <span className="flex-1 min-w-0 text-[10px] font-mono text-[#ABABAB] uppercase tracking-wider">Domain</span>
      <span className={`${COL.type} text-[10px] font-mono text-[#ABABAB] uppercase tracking-wider`}>Type</span>
      <span className={`${COL.platforms} text-[10px] font-mono text-[#ABABAB] uppercase tracking-wider`}>Platforms</span>
      <span className={`${COL.count} text-[10px] font-mono text-[#ABABAB] uppercase tracking-wider`}>Cites</span>
      <span className={COL.chevron} />
    </div>
  )
}

function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host === 'youtube.com' || host === 'youtu.be'
  } catch { return false }
}

function useYouTubeTitles(urls: string[], enabled: boolean): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!enabled) return
    const ytUrls = urls.filter(isYouTubeUrl)
    if (ytUrls.length === 0) return

    Promise.all(
      ytUrls.map(async (url) => {
        try {
          const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
          if (!res.ok) return null
          const data = await res.json() as { title?: string }
          return data.title ? [url, data.title] as const : null
        } catch { return null }
      })
    ).then((results) => {
      const map: Record<string, string> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      if (Object.keys(map).length > 0) setTitles(map)
    })
  }, [enabled, urls.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  return titles
}

export function DomainRow({ entry, isExpanded, onToggle }: {
  entry: DomainEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const urls = entry.sampleUrls.length > 0 ? entry.sampleUrls : [`https://${entry.domain}`]
  const isGap = entry.isGap
  const ytTitles = useYouTubeTitles(urls, isExpanded)

  return (
    <div className={isGap ? 'border-l-2 border-l-[#CEAC01]' : ''}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#FAFAF8] transition-colors text-left"
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Image
            src={`https://www.google.com/s2/favicons?domain=${entry.domain}&sz=16`}
            alt=""
            width={16}
            height={16}
            className="rounded-sm shrink-0"
            unoptimized
          />
          <span className="font-mono text-[13px] text-[#1A1A1A] truncate">
            {entry.domain}
          </span>
        </div>

        <div className={COL.type}>
          {entry.sourceType === 'unknown' ? (
            <span className="text-[10px] font-mono text-[#CDCBC6]">—</span>
          ) : (
            <span
              className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ backgroundColor: SOURCE_TYPE_COLOR[entry.sourceType] + '28', color: SOURCE_TYPE_COLOR[entry.sourceType] }}
            >
              {SOURCE_TYPE_LABELS[entry.sourceType]}
            </span>
          )}
        </div>

        <div className={`${COL.platforms} flex items-center gap-1 flex-wrap`}>
          {entry.platformNames.map((p) => (
            <span key={p} className="text-[10px] font-mono bg-[#F3F2EF] text-[#6C6C6C] px-1.5 py-0.5 rounded">
              {PLATFORM_LABELS[p] ?? p}
            </span>
          ))}
        </div>

        <span className={`${COL.count} text-[11px] font-mono text-[#ABABAB]`}>
          {entry.citedInProbeCount}
        </span>

        <div className={COL.chevron}>
          <svg
            className={`w-3 h-3 text-[#CCCCCC] transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-2.5 pt-0.5 bg-[#FAFAF8] space-y-1">
          {urls.map((url) => {
            const title = ytTitles[url]
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono text-[11px] text-[#6C6C6C] hover:text-[#0066CC] hover:underline transition-colors break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {title ?? url.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
