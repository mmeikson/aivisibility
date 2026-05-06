'use client'

export function ViewAllRecsButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('percelo:switch-tab', { detail: 'recommendations' }))}
      className="text-xs font-mono text-[#6C6C6C] hover:text-[#141414] transition-colors"
    >
      View all recommendations →
    </button>
  )
}
