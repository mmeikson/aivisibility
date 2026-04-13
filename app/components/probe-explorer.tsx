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

const PROMPT_TYPE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  comparison: 'Comparison',
  job_to_be_done: 'Job-to-be-done',
}

interface Props {
  probes: Probe[]
  companyName: string
}

export function ProbeExplorer({ probes, companyName }: Props) {
  const [selected, setSelected] = useState<Probe | null>(null)

  const platforms = ['openai', 'anthropic', 'perplexity', 'google'] as const
  const byPlatform = Object.fromEntries(
    platforms.map((p) => [
      p,
      probes
        .filter((probe) => probe.platform === p)
        .filter((probe, i, arr) => arr.findIndex((x) => x.prompt_text === probe.prompt_text) === i),
    ])
  )

  const activePlatforms = platforms.filter((p) => byPlatform[p].length > 0)
  const [activeTab, setActiveTab] = useState<string>(activePlatforms[0] ?? 'openai')

  const platformProbes = byPlatform[activeTab] ?? []
  const mentionedCount = platformProbes.filter((p) => p.parsed_json?.was_mentioned).length

  return (
    <>
      {/* Tab bar */}
      <div className="border-b border-[#E5E2DC] flex gap-0">
        {activePlatforms.map((platform) => (
          <button
            key={platform}
            onClick={() => setActiveTab(platform)}
            className={`px-4 py-2.5 text-xs font-mono tracking-wide transition-colors border-b-2 -mb-px ${
              activeTab === platform
                ? 'border-[#141414] text-[#141414]'
                : 'border-transparent text-[#ABABAB] hover:text-[#6C6C6C]'
            }`}
          >
            {PLATFORM_LABELS[platform] ?? platform}
          </button>
        ))}
        <div className="flex-1 flex items-center justify-end pb-1">
          <span className="text-xs font-mono text-[#ABABAB]">
            {mentionedCount}/{platformProbes.length} mentioned
          </span>
        </div>
      </div>

      {/* Tab body */}
      <div className="rounded-b-lg border border-t-0 border-[#E5E2DC] bg-white overflow-hidden">
        {platformProbes.map((probe, i) => {
          const mentioned = probe.parsed_json?.was_mentioned
          const strength = probe.parsed_json?.recommendation_strength
          const isLast = i === platformProbes.length - 1

          return (
            <button
              key={probe.id}
              onClick={() => setSelected(probe)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F3F2EF] transition-colors group ${
                !isLast ? 'border-b border-[#E5E2DC]' : ''
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  probe.status !== 'complete'
                    ? 'bg-[#CDCBC6]'
                    : mentioned
                    ? 'bg-[#16a34a]'
                    : 'bg-[#E5E2DC]'
                }`}
              />
              <span className="flex-1 text-xs text-[#141414] truncate">
                {probe.prompt_text}
              </span>
              <span className="shrink-0 text-[10px] font-mono text-[#ABABAB] uppercase tracking-wide hidden sm:block">
                {PROMPT_TYPE_LABELS[probe.prompt_type] ?? probe.prompt_type}
              </span>
              {strength && strength !== 'none' && (
                <span className={`shrink-0 text-[10px] font-mono uppercase tracking-wide ${
                  strength === 'confident' ? 'severity-healthy' : 'severity-moderate'
                }`}>
                  {strength}
                </span>
              )}
              <span className="shrink-0 text-[#CDCBC6] group-hover:text-[#6C6C6C] transition-colors text-xs">→</span>
            </button>
          )
        })}
      </div>

      {selected && createPortal(
        <ProbeModal probe={selected} companyName={companyName} onClose={() => setSelected(null)} />,
        document.body
      )}
    </>
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
    } else if (t.match(/^[-*] /)) {
      if (listType !== 'ul') {
        if (listType) out.push(`</${listType}>`)
        out.push('<ul class="list-disc list-outside ml-4 space-y-1 my-2">')
        listType = 'ul'
      }
      out.push(`<li>${t.slice(2)}</li>`)
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
      out.push(`<p>${t}</p>`)
    }
  }
  if (listType) out.push(`</${listType}>`)

  // Inline styles: bold and italic
  let result = out.join('')
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')

  // Highlight company name (only in text nodes, not inside HTML tags)
  if (companyName) {
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`(?<=>|^)([^<]*)`, 'g'),
      (match) => match.replace(
        new RegExp(escaped, 'gi'),
        '<mark style="background:#fef08a;border-radius:2px;padding:0 2px">$&</mark>'
      )
    )
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
              className="text-xs text-[#141414] leading-relaxed space-y-1"
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
