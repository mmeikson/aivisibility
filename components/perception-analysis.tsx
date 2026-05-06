import type { PlatformPerception } from '@/lib/db/types'

const PLATFORM_ORDER = ['openai', 'anthropic', 'google']
const PLATFORM_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  google: 'Gemini',
}
const PLATFORM_ICONS: Record<string, string> = {
  openai: '/openai.svg',
  anthropic: '/claude.svg',
  google: '/gemini.svg',
}

interface Props {
  perceptions: Record<string, PlatformPerception>
}

export function PerceptionAnalysis({ perceptions }: Props) {
  const platforms = PLATFORM_ORDER.filter((p) => perceptions[p])
  if (platforms.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {platforms.map((platform) => {
        const data = perceptions[platform]
        return (
          <div
            key={platform}
            className="rounded-lg border border-[#E5E2DC] bg-white p-5 flex flex-col gap-3"
          >
            {/* Platform header */}
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={PLATFORM_ICONS[platform] ?? ''}
                alt={PLATFORM_LABELS[platform]}
                width={16}
                height={16}
                className="opacity-70"
              />
              <span className="text-xs font-mono text-[#6C6C6C] uppercase tracking-widest">
                {PLATFORM_LABELS[platform] ?? platform}
              </span>
            </div>

            {/* Summary */}
            <p className="text-sm text-[#141414] leading-relaxed">{data.summary}</p>

            {/* Quotes */}
            {data.quotes?.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {data.quotes.map((q, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-[#E5E2DC] pl-3 text-xs text-[#6C6C6C] leading-relaxed italic"
                  >
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
