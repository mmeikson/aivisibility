'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Recommendation } from '@/lib/db/types'

const effortColor: Record<string, string> = {
  low: 'severity-healthy',
  medium: 'severity-moderate',
  high: 'severity-weak',
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

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

  return out.join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
}

export function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const effort = rec.effort?.toLowerCase() ?? 'medium'

  function handleCopy() {
    navigator.clipboard.writeText(rec.copy_asset_text!)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className={`rounded-lg border border-[#E5E2DC] bg-white overflow-hidden fade-up fade-up-${Math.min(index + 3, 5)}`}>
        {/* Card header */}
        <div className="px-5 py-4 border-b border-[#E5E2DC]">
          <div className="flex items-start gap-3">
            <span className="score-number text-xl text-[#CDCBC6] shrink-0 mt-0.5">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-[#141414]">{rec.title}</h3>
                {rec.effort && (
                  <span className={`text-[10px] font-mono uppercase tracking-wide ${effortColor[effort] ?? ''}`}>
                    {rec.effort} effort
                  </span>
                )}
              </div>
              {rec.why_it_matters && (
                <p className="text-xs text-[#6C6C6C] leading-relaxed">{rec.why_it_matters}</p>
              )}
            </div>
          </div>
        </div>

        {/* Action steps */}
        {rec.actions.length > 0 && (
          <div className="px-5 py-4 space-y-2">
            <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">Action steps</p>
            <ol className="space-y-1.5">
              {rec.actions.map((action, i) => (
                <li key={i} className="flex gap-2 text-xs text-[#141414] leading-relaxed">
                  <span className="font-mono text-[#ABABAB] shrink-0">{i + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Footer with copy button */}
        {rec.copy_asset_text && (
          <div className="px-5 py-3 border-t border-[#E5E2DC] bg-[#FAFAF8]">
            <button
              onClick={() => setModalOpen(true)}
              className="text-xs font-mono text-[#6C6C6C] hover:text-[#141414] transition-colors flex items-center gap-1.5 group"
            >
              <span className="w-3.5 h-3.5 border border-current rounded flex items-center justify-center text-[9px] opacity-60 group-hover:opacity-100 transition-opacity">↗</span>
              Get copy template
            </button>
          </div>
        )}
      </div>

      {/* Modal — rendered at document.body to escape stacking context */}
      {modalOpen && rec.copy_asset_text && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          onClick={() => setModalOpen(false)}
        >
          <div className="absolute inset-0 bg-[#141414]/40 backdrop-blur-[2px]" />
          <div
            className="relative w-full max-w-lg flex flex-col bg-[#FAFAF8] rounded-xl border border-[#E5E2DC] shadow-2xl slide-in-right overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC]">
              <div className="space-y-0.5">
                <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">Copy template</p>
                <p className="text-sm font-medium text-[#141414]">{rec.title}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[#ABABAB] hover:text-[#141414] transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <div
                className="text-xs text-[#141414] leading-relaxed space-y-1"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(rec.copy_asset_text) }}
              />
            </div>
            <div className="px-5 py-3 border-t border-[#E5E2DC] flex justify-end">
              <button
                onClick={handleCopy}
                className="text-xs font-mono transition-colors text-[#6C6C6C] hover:text-[#141414]"
              >
                {copied ? <span className="text-[#16a34a]">Copied!</span> : 'Copy to clipboard'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
