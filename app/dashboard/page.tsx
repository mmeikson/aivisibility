export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/db/client'
import SignOutButton from './sign-out-button'
import type { Report } from '@/lib/db/types'
import { severityLabel, severityClass } from '@/lib/scoring/priority'
import { SCORE_WEIGHTS } from '@/lib/constants'

function formatDuration(createdAt: string, completedAt: string | null): string {
  if (!completedAt) return '—'
  const secs = Math.round((new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

async function getUserReports(userId: string): Promise<(Report & { avg_score: number | null })[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('reports')
    .select('*, scores(raw_score, category)')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((r) => {
    const scores = (r.scores as { raw_score: number; category: string }[]) ?? []
    const avg = scores.length > 0
      ? Math.round(scores.reduce((sum, x) => sum + x.raw_score * (SCORE_WEIGHTS[x.category] ?? 0.25), 0))
      : null
    return { ...r, avg_score: avg }
  })
}

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect('/auth')

  const reports = await getUserReports(user.id)

  return (
    <main className="min-h-screen flex flex-col bg-[#FAFAF8]">
      <header className="px-8 py-5 flex items-center justify-between border-b border-[#E5E2DC]">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/PerceloLogo.svg" alt="Percelo" style={{ height: "20px", width: "auto" }} />
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#ABABAB]">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <div className="flex-1 px-6 py-12 max-w-4xl mx-auto w-full">
        <div className="space-y-8 fade-up">
          <div className="space-y-1">
            <div className="text-xs font-mono text-[#ABABAB] tracking-widest uppercase">Dashboard</div>
            <h1
              className="text-3xl text-[#141414] tracking-tight"
              style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600 }}
            >
              Your analyses
            </h1>
          </div>

          {reports.length === 0 ? (
            <div className="rounded-lg border border-[#E5E2DC] bg-white px-8 py-12 text-center space-y-3">
              <p className="text-sm text-[#6C6C6C]">No saved analyses yet.</p>
              <Link
                href="/"
                className="inline-block text-sm text-[#141414] underline underline-offset-2"
              >
                Run your first analysis →
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E5E2DC] bg-white overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-[#E5E2DC] text-[10px] font-mono text-[#ABABAB] uppercase tracking-widest">
                <span>URL</span>
                <span className="text-right w-20">Score</span>
                <span className="text-right w-20">Status</span>
                <span className="text-right w-16">Time</span>
                <span className="text-right w-28">Date</span>
              </div>

              {reports.map((report, i) => (
                <Link
                  key={report.id}
                  href={`/report/${report.id}`}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-[#F3F2EF] transition-colors group ${
                    i < reports.length - 1 ? 'border-b border-[#E5E2DC]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#141414] truncate">
                      {report.company_name ?? new URL(report.url).hostname}
                    </p>
                    <p className="text-xs text-[#ABABAB] font-mono truncate">
                      {report.url.replace(/^https?:\/\//, '')}
                    </p>
                  </div>

                  <div className="text-right w-20">
                    {report.avg_score !== null ? (
                      <span className={`score-number text-2xl ${severityClass(report.avg_score)}`}>
                        {report.avg_score}
                      </span>
                    ) : (
                      <span className="text-xs text-[#ABABAB]">—</span>
                    )}
                  </div>

                  <div className="text-right w-20">
                    {report.avg_score !== null ? (
                      <span className={`text-[10px] font-mono uppercase tracking-wide ${severityClass(report.avg_score)}`}>
                        {severityLabel(report.avg_score)}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-right w-16">
                    <span className="text-xs font-mono text-[#ABABAB]">
                      {formatDuration(report.created_at, report.completed_at)}
                    </span>
                  </div>

                  <div className="text-right w-28">
                    <span className="text-xs font-mono text-[#ABABAB]">
                      {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-[#141414] bg-[#141414] text-[#FAFAF8] px-5 py-2.5 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            >
              + New analysis
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

