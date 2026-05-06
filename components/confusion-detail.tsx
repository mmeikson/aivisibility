'use client'

import { useState } from 'react'

export function ConfusionDetail({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <span>
      {' '}
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[#6C6C6C] underline underline-offset-2 hover:text-[#141414] transition-colors"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && names.length > 0 && (
        <span className="ml-1 text-[#6C6C6C]">
          {names.map((name, i) => (
            <span key={name}>
              {i > 0 && <span className="mx-1">·</span>}
              {name}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
