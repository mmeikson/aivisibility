'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/db/client'
import { Progress } from '@/components/ui/progress'
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
  if (!lastStep) return 5
  const idx = STEP_ORDER.indexOf(lastStep)
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100)
}

export default function LoadingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [events, setEvents] = useState<PipelineEvent[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    // Load existing events
    async function loadEvents() {
      const { data } = await getSupabaseClient()
        .from('pipeline_events')
        .select('*')
        .eq('report_id', id)
        .order('created_at', { ascending: true })
      if (data) setEvents(data)
    }
    loadEvents()

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
        (payload) => {
          const event = payload.new as PipelineEvent
          setEvents((prev) => [...prev, event])

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
    }
  }, [id, router])

  const progress = progressPercent(events)
  const latestMessage = events.at(-1)?.message ?? 'Initializing...'

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Analyzing your brand visibility</h1>

        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground">{latestMessage}</p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="text-left space-y-1 max-h-48 overflow-y-auto">
          {events.map((e) => (
            <p key={e.id} className="text-xs text-muted-foreground">
              {e.message}
            </p>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">This takes 2–4 minutes. Don&apos;t close this tab.</p>
      </div>
    </main>
  )
}
