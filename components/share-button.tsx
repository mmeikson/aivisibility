'use client'

import { useState } from 'react'

export function ShareButton({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(`${window.location.origin}/report/${reportId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs font-mono text-[#16a34a] hover:text-[#141414] transition-colors"
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  )
}
