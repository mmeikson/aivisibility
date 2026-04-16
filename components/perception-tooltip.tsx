'use client'

import { useState } from 'react'

interface Props {
  category: string
  description: string
}

export function PerceptionAccordion({ category, description }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <p className="text-base text-[#6C6C6C] flex items-center gap-2">
        {category}
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-[#ABABAB] hover:text-[#6C6C6C] transition-colors underline underline-offset-2 decoration-dotted"
        >
          {open ? 'show less' : 'show more'}
        </button>
      </p>

      {open && (
        <div className="mt-2 rounded-md border border-[#E5E2DC] bg-[#F7F6F3] px-4 py-3 space-y-1">
          <p className="text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">How AI currently perceives your brand</p>
          <p className="text-sm text-[#6C6C6C] leading-relaxed">&ldquo;{description}&rdquo;</p>
          <p className="text-[11px] text-[#ABABAB] leading-relaxed">Inferred from your website. Drives all probes and scoring — if it&rsquo;s off, your site is likely sending mixed signals to AI models.</p>
        </div>
      )}
    </div>
  )
}
