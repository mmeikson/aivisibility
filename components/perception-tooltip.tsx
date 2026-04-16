'use client'

import { useState } from 'react'

interface Props {
  description: string
}

export function PerceptionTooltip({ description }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-[#CDCBC6] hover:text-[#ABABAB] transition-colors align-middle"
        aria-label="How AI currently perceives your brand"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
          <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 pointer-events-none">
          <span className="block rounded-lg border border-[#E5E2DC] bg-white shadow-lg px-4 py-3 space-y-1.5">
            <span className="block text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">How AI currently perceives your brand</span>
            <span className="block text-xs text-[#141414] leading-relaxed">&ldquo;{description}&rdquo;</span>
            <span className="block text-[11px] text-[#ABABAB] leading-relaxed">Inferred from your website. Drives all probes and scoring — if it&rsquo;s off, your site is likely sending mixed signals to AI models.</span>
          </span>
        </span>
      )}
    </span>
  )
}
