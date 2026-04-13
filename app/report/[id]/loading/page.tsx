'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/db/client'
import type { PipelineEvent } from '@/lib/db/types'

const STEP_ORDER = [
  'crawl_start',
  'crawl_done',
  'inference_done',
  'probes_start',
  'probe_batch_done',
  'scoring_done',
  'complete',
]

function progressPercent(events: PipelineEvent[]): number {
  const types = events.map((e) => e.event_type)
  const lastStep = [...STEP_ORDER].reverse().find((s) => types.includes(s as PipelineEvent['event_type']))
  if (!lastStep) return 4
  const idx = STEP_ORDER.indexOf(lastStep)
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100)
}

export default function LoadingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [events, setEvents] = useState<PipelineEvent[]>([])
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    // Load report URL
    getSupabaseClient()
      .from('reports')
      .select('url')
      .eq('id', id)
      .single()
      .then(({ data }: { data: { url: string } | null }) => { if (data) setUrl(data.url) })

    // Load existing events — redirect immediately if already complete
    getSupabaseClient()
      .from('pipeline_events')
      .select('*')
      .eq('report_id', id)
      .order('created_at', { ascending: true })
      .then(({ data }: { data: PipelineEvent[] | null }) => {
        if (data) {
          setEvents(data)
          if (data.some((e) => e.event_type === 'complete')) {
            router.push(`/report/${id}`)
          }
        }
      })

    // Poll report status every 5s as fallback if Realtime misses the event
    const poll = setInterval(async () => {
      const { data } = await getSupabaseClient()
        .from('reports')
        .select('status')
        .eq('id', id)
        .single()
      if (data?.status === 'complete') router.push(`/report/${id}`)
      if (data?.status === 'failed') setError('Analysis failed. Please try again.')
    }, 5000)

    // Subscribe to new events via Realtime
    const channel = getSupabaseClient()
      .channel(`report-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pipeline_events',
          filter: `report_id=eq.${id}`,
        },
        (payload: { new: PipelineEvent }) => {
          const event = payload.new as PipelineEvent
          setEvents((prev) => prev.some((e) => e.id === event.id) ? prev : [...prev, event])
          if (event.event_type === 'complete') {
            setTimeout(() => router.push(`/report/${id}`), 800)
          }
          if (event.event_type === 'error') {
            setError(event.message ?? 'Analysis failed')
          }
        }
      )
      .subscribe()

    return () => {
      getSupabaseClient().removeChannel(channel)
      clearInterval(poll)
    }
  }, [id, router])

  const progress = progressPercent(events)
  const isComplete = events.some((e) => e.event_type === 'complete')

  return (
    <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
      {/* Top bar */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: "20px", width: "auto" }} />
        </Link>
        <span className="text-xs text-[#6C6C6C]">Beta</span>
      </header>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg space-y-10">

          {/* Heading */}
          <div className="space-y-2 fade-up">
            <div className="flex items-center gap-2 text-xs font-mono text-[#6C6C6C] tracking-widest uppercase">
              <span className={`w-1.5 h-1.5 rounded-full ${isComplete ? 'bg-[#16a34a]' : 'bg-[#141414] pulse-dot'}`} />
              {isComplete ? 'Complete' : 'In progress'}
            </div>
            <h1
              className="text-3xl text-[#141414] leading-tight tracking-tight"
              style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600 }}
            >
              Analyzing your<br />AI visibility
            </h1>
            {url && (
              <p className="text-sm font-mono text-[#6C6C6C] truncate">{url.replace(/^https?:\/\//, '')}</p>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-2 fade-up fade-up-1">
            <div className="h-0.5 w-full bg-[#E5E2DC] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#141414] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-mono text-[#ABABAB]">{progress}%</span>
              <span className="text-xs text-[#ABABAB]">~2–4 min</span>
            </div>
          </div>

          {/* Event feed */}
          <div className="space-y-0 fade-up fade-up-2">
            {events.length === 0 ? (
              <div className="flex items-center gap-3 py-2">
                <span className="w-1 h-1 rounded-full bg-[#141414] pulse-dot" />
                <span className="text-sm text-[#6C6C6C]">Initializing...</span>
              </div>
            ) : (
              (() => {
                // Collapse probe_progress events: show only latest per platform,
                // replaced by probe_batch_done once that platform finishes.
                type Row = { key: string; message: string; state: 'running' | 'done' | 'error' }
                const rows: Row[] = []
                const platformLatest: Record<string, PipelineEvent> = {}
                const platformDone = new Set<string>()

                const flushPlatforms = () => {
                  for (const pe of Object.values(platformLatest)) {
                    rows.push({ key: pe.id, message: pe.message ?? '', state: 'running' })
                  }
                  Object.keys(platformLatest).forEach(k => delete platformLatest[k])
                }

                for (const e of events) {
                  if (e.event_type === 'probe_progress') {
                    const platform = e.message?.split(':')[0] ?? ''
                    platformLatest[platform] = e
                  } else if (e.event_type === 'probe_batch_done') {
                    const platform = e.message?.split(':')[0] ?? ''
                    platformDone.add(platform)
                    delete platformLatest[platform]
                    rows.push({ key: e.id, message: e.message ?? '', state: 'done' })
                  } else {
                    flushPlatforms()
                    const isLast = e === events[events.length - 1]
                    const state = e.event_type === 'error' ? 'error' : (isLast && !isComplete) ? 'running' : 'done'
                    rows.push({ key: e.id, message: e.message ?? '', state })
                  }
                }
                flushPlatforms()

                return rows.map(({ key, message, state }) => (
                  <div key={key} className="flex items-center gap-3 py-1.5">
                    <div className="shrink-0 w-4 flex items-center justify-center">
                      {state === 'error' ? (
                        <span className="text-xs text-[#b91c1c]">✕</span>
                      ) : state === 'done' ? (
                        <svg className="w-3.5 h-3.5 text-[#16a34a]" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#141414] pulse-dot" />
                      )}
                    </div>
                    <span className={`text-sm leading-snug ${
                      state === 'error' ? 'text-[#b91c1c]' : state === 'done' ? 'text-[#ABABAB]' : 'text-[#141414]'
                    }`}>
                      {message}
                    </span>
                  </div>
                ))
              })()
            )}
          </div>

          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
              {error}
              <a href="/" className="ml-2 underline">Start over</a>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-[#E5E2DC] flex items-center justify-between">
        <span className="text-xs text-[#ABABAB]">Don&apos;t close this tab — analysis is running.</span>
        <span className="text-xs text-[#ABABAB] font-mono">v1</span>
      </footer>
    </main>
  )
}
