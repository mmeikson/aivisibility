'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Probe } from '@/lib/db/types'

const PLATFORM_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  perplexity: 'Perplexity',
  google: 'Gemini',
}

const PLATFORM_ICONS: Record<string, string> = {
  openai: '/logos/ChatGPT-Logo.svg',
  anthropic: '/logos/claude-color.svg',
  perplexity: '/logos/Perplexity--Streamline-Simple-Icons.svg',
  google: '/logos/gemini-color.svg',
}

const ENGINE_USERS: Record<string, string> = {
  openai: '~900M users',
  anthropic: '~30M users',
  perplexity: '~15M users',
  google: '~300M users',
}

const PROMPT_TYPE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  comparison: 'Comparison',
  job_to_be_done: 'Job-to-be-done',
}

const PROMPT_TYPES = ['discovery', 'comparison', 'job_to_be_done'] as const

interface Props {
  probes: Probe[]
  companyName: string
  platformSummaries?: Record<string, string>
}


// Maps prompt_text → platform → Probe
function buildMatrix(probes: Probe[], platforms: readonly string[]): {
  prompts: string[]
  matrix: Map<string, Map<string, Probe>>
} {
  const promptOrder: string[] = []
  const seen = new Set<string>()
  for (const p of probes) {
    if (!seen.has(p.prompt_text)) {
      seen.add(p.prompt_text)
      promptOrder.push(p.prompt_text)
    }
  }
  const matrix = new Map<string, Map<string, Probe>>()
  for (const text of promptOrder) {
    const row = new Map<string, Probe>()
    for (const platform of platforms) {
      const probe = probes.find((p) => p.prompt_text === text && p.platform === platform)
      if (probe) row.set(platform, probe)
    }
    matrix.set(text, row)
  }
  return { prompts: promptOrder, matrix }
}

function MentionDot({ probe, onClick }: { probe: Probe | undefined; onClick: () => void }) {
  if (!probe) return <td className="px-3 py-2.5 text-center" />

  const mentioned = probe.parsed_json?.was_mentioned
  const strength = probe.parsed_json?.recommendation_strength

  let dotClass = 'bg-[#E5E2DC]' // not mentioned
  if (mentioned) {
    dotClass = strength === 'confident' ? 'bg-[#16a34a]' : 'bg-[#CEAC01]'
  }

  return (
    <td className="px-3 py-2.5 text-center">
      <button
        onClick={onClick}
        title={mentioned ? `${strength} recommendation` : 'Not mentioned'}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:opacity-70 transition-opacity"
      >
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      </button>
    </td>
  )
}

export function ProbeExplorer({ probes, companyName, platformSummaries = {} }: Props) {
  const [selected, setSelected] = useState<Probe | null>(null)

  const platforms = ['openai', 'anthropic', 'perplexity', 'google'] as const
  const activePlatforms = platforms.filter((p) => probes.some((r) => r.platform === p))

  const { prompts, matrix } = buildMatrix(probes, activePlatforms)

  // Summary stats per platform
  const stats = Object.fromEntries(
    activePlatforms.map((p) => {
      const platformProbes = probes.filter((r) => r.platform === p)
      const mentioned = platformProbes.filter((r) => r.parsed_json?.was_mentioned).length
      return [p, { mentioned, total: platformProbes.length }]
    })
  )

  return (
    <div className="rounded-lg border border-[#E5E2DC] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E5E2DC] bg-[#FAFAF8]">
              <th className="px-5 py-3 text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest font-normal w-full">
                Prompt
              </th>
              {activePlatforms.map((p) => (
                <th key={p} className="px-3 py-3 text-center whitespace-nowrap">
                  <div className="flex flex-col items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={PLATFORM_ICONS[p]} alt={PLATFORM_LABELS[p]} width={16} height={16} className="shrink-0" />
                    <span className="text-[10px] font-mono text-[#ABABAB] tracking-wide">
                      {stats[p]?.mentioned ?? 0}/{stats[p]?.total ?? 0}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompts.map((text, i) => {
              const row = matrix.get(text)
              const isLast = i === prompts.length - 1
              // Probe type from any platform
              const anyProbe = row ? [...row.values()][0] : undefined
              return (
                <tr
                  key={text}
                  className={`hover:bg-[#F3F2EF] transition-colors ${!isLast ? 'border-b border-[#E5E2DC]' : ''}`}
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs text-[#141414] leading-snug">{text}</span>
                      {anyProbe && (
                        <span className="shrink-0 text-[10px] font-mono text-[#CDCBC6] uppercase tracking-wide hidden sm:inline">
                          {PROMPT_TYPE_LABELS[anyProbe.prompt_type] ?? anyProbe.prompt_type}
                        </span>
                      )}
                    </div>
                  </td>
                  {activePlatforms.map((p) => (
                    <MentionDot
                      key={p}
                      probe={row?.get(p)}
                      onClick={() => { const pr = row?.get(p); if (pr) setSelected(pr) }}
                    />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-3 border-t border-[#E5E2DC] bg-[#FAFAF8]">
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#ABABAB]">
          <span className="w-2 h-2 rounded-full bg-[#16a34a]" /> Confident
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#ABABAB]">
          <span className="w-2 h-2 rounded-full bg-[#CEAC01]" /> Hedged
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#ABABAB]">
          <span className="w-2 h-2 rounded-full bg-[#E5E2DC]" /> Not mentioned
        </span>
        <span className="text-[10px] font-mono text-[#CDCBC6] ml-auto">click any dot to view response</span>
      </div>

      {selected && createPortal(
        <ProbeModal probe={selected} companyName={companyName} onClose={() => setSelected(null)} />,
        document.body
      )}
    </div>
  )
}

function renderResponse(text: string, companyName: string): string {
  // Escape HTML entities first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Process block elements line by line
  const lines = html.split('\n')
  const out: string[] = []
  let listType = ''

  for (const line of lines) {
    const t = line.trim()

    if (t.startsWith('### ')) {
      if (listType) { out.push(`</${listType}>`); listType = '' }
      out.push(`<p class="font-semibold text-[#141414] mt-3 mb-0.5">${t.slice(4)}</p>`)
    } else if (t.startsWith('## ')) {
      if (listType) { out.push(`</${listType}>`); listType = '' }
      out.push(`<p class="font-semibold text-[#141414] mt-3 mb-0.5">${t.slice(3)}</p>`)
    } else if (t.startsWith('# ')) {
      if (listType) { out.push(`</${listType}>`); listType = '' }
      out.push(`<p class="font-semibold text-[#141414] mt-3 mb-0.5">${t.slice(2)}</p>`)
    } else if (t.match(/^[-*] /) || t.match(/^[•▸‣] ?/)) {
      if (listType !== 'ul') {
        if (listType) out.push(`</${listType}>`)
        out.push('<ul class="list-disc list-outside ml-4 space-y-1 my-2">')
        listType = 'ul'
      }
      out.push(`<li>${t.replace(/^[-*•▸‣] ?/, '')}</li>`)
    } else if (t.match(/^\d+\. /)) {
      if (listType !== 'ol') {
        if (listType) out.push(`</${listType}>`)
        out.push('<ol class="list-decimal list-outside ml-4 space-y-1 my-2">')
        listType = 'ol'
      }
      out.push(`<li>${t.replace(/^\d+\. /, '')}</li>`)
    } else if (t === '') {
      if (listType) { out.push(`</${listType}>`); listType = '' }
      out.push('<div class="h-2"></div>')
    } else {
      if (listType) { out.push(`</${listType}>`); listType = '' }
      // Lines starting with an emoji get extra top spacing (Bright Data uses these as section headers)
      const startsWithEmoji = /^\p{Emoji}/u.test(t)
      const cls = startsWithEmoji ? 'class="mt-3 font-medium"' : ''
      out.push(`<p ${cls}>${t}</p>`)
    }
  }
  if (listType) out.push(`</${listType}>`)

  // Inline styles: bold and italic
  let result = out.join('')
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')

  // Highlight company name in text nodes only (not inside HTML tags)
  if (companyName) {
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const nameRe = new RegExp(escaped, 'gi')
    result = result
      .split(/(<[^>]+>)/)
      .map((part) => part.startsWith('<') ? part : part.replace(nameRe, '<mark style="background:#fef08a;border-radius:2px;padding:0 2px">$&</mark>'))
      .join('')
  }

  return result
}

function ProbeModal({ probe, companyName, onClose }: { probe: Probe; companyName: string; onClose: () => void }) {
  const parsed = probe.parsed_json
  const mentioned = parsed?.was_mentioned
  const competitors = parsed?.competitor_mentions ?? []
  const html = probe.response_text ? renderResponse(probe.response_text, companyName) : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#141414]/40 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#FAFAF8] rounded-xl border border-[#E5E2DC] shadow-2xl slide-in-right overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E5E2DC]">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-[#6C6C6C] uppercase tracking-widest">
                {PLATFORM_LABELS[probe.platform] ?? probe.platform}
              </span>
              <span className="w-1 h-1 rounded-full bg-[#CDCBC6]" />
              <span className="text-xs font-mono text-[#ABABAB] uppercase tracking-wide">
                {PROMPT_TYPE_LABELS[probe.prompt_type] ?? probe.prompt_type}
              </span>
            </div>
            <p className="text-sm font-medium text-[#141414]">{probe.prompt_text}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[#ABABAB] hover:text-[#141414] transition-colors text-lg leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Metadata strip */}
        <div className="flex items-center gap-3 px-6 py-2.5 bg-[#F3F2EF] border-b border-[#E5E2DC] text-xs font-mono flex-wrap">
          <span className={`flex items-center gap-1.5 ${mentioned ? 'severity-healthy' : 'text-[#ABABAB]'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${mentioned ? 'severity-bar-healthy' : 'bg-[#CDCBC6]'}`} />
            {mentioned ? `${companyName} mentioned` : 'Not mentioned'}
          </span>
          {parsed?.recommendation_strength && parsed.recommendation_strength !== 'none' && (
            <>
              <span className="text-[#CDCBC6]">·</span>
              <span className={parsed.recommendation_strength === 'confident' ? 'severity-healthy' : 'severity-moderate'}>
                {parsed.recommendation_strength} recommendation
              </span>
            </>
          )}
          {parsed?.entity_confused && (
            <>
              <span className="text-[#CDCBC6]">·</span>
              <span className="text-[#CEAC01]">
                ⚠ confused with {parsed.confused_with ?? 'another entity'}
              </span>
            </>
          )}
          {competitors.length > 0 && (
            <>
              <span className="text-[#CDCBC6]">·</span>
              <span className="text-[#6C6C6C]">
                {competitors.slice(0, 3).join(', ')}{competitors.length > 3 ? ` +${competitors.length - 3}` : ''} mentioned
              </span>
            </>
          )}
        </div>

        {/* Response */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {html ? (
            <div
              className="text-xs text-[#141414] leading-relaxed space-y-2"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-[#ABABAB] italic">No response recorded.</p>
          )}
        </div>

        {/* Citations */}
        {probe.citations && probe.citations.length > 0 && (
          <div className="px-6 py-4 border-t border-[#E5E2DC]">
            <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest mb-2">Sources</p>
            <div className="space-y-1">
              {probe.citations.map((url, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-[#CDCBC6] mt-0.5 shrink-0">{i + 1}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#6C6C6C] hover:text-[#141414] truncate transition-colors"
                  >
                    {url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E5E2DC] flex items-center justify-between">
          <span className="text-xs text-[#ABABAB]">
            {probe.latency_ms ? `${(probe.latency_ms / 1000).toFixed(1)}s` : ''}
          </span>
          <button onClick={onClose} className="text-xs text-[#6C6C6C] hover:text-[#141414] transition-colors font-mono">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
