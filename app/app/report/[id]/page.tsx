import { redirect } from 'next/navigation'
import { getReport, getScoresByReport, getRecommendationsByReport } from '@/lib/db/queries'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params
  const report = await getReport(id)

  if (!report) {
    redirect('/')
  }

  if (report.status === 'pending' || report.status === 'running') {
    redirect(`/report/${id}/loading`)
  }

  if (report.status === 'failed') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Analysis failed</h1>
          <p className="text-muted-foreground text-sm">Something went wrong. Please try again.</p>
          <a href="/" className="text-sm underline">
            Start a new analysis
          </a>
        </div>
      </main>
    )
  }

  const [scores, recommendations] = await Promise.all([
    getScoresByReport(id),
    getRecommendationsByReport(id),
  ])

  const topRecs = recommendations.slice(0, 3)

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">{report.company_name ?? report.url}</h1>
          <p className="text-muted-foreground">
            {report.category} · {report.created_at ? new Date(report.created_at).toLocaleDateString() : ''}
          </p>
          {report.competitors.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {report.competitors.map((c) => (
                <span
                  key={c}
                  className="rounded-full border px-3 py-0.5 text-xs text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-2 gap-4">
          {scores.map((score) => (
            <a
              key={score.id}
              href={`/report/${id}/${score.category}`}
              className="rounded-lg border p-5 hover:bg-muted/50 transition-colors space-y-1"
            >
              <p className="text-sm font-medium capitalize">
                {score.category.replace('_', ' ')}
              </p>
              <p className="text-4xl font-bold">{score.raw_score}</p>
              <p className="text-xs text-muted-foreground">
                {scoreLabel(score.raw_score)}
              </p>
            </a>
          ))}
        </div>

        {/* Priority action queue */}
        {topRecs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Top priority actions</h2>
            {topRecs.map((rec) => (
              <div key={rec.id} className="rounded-lg border p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{rec.title}</p>
                  <span className="rounded-full border px-2 py-0.5 text-xs capitalize shrink-0">
                    {rec.type.replace('_', ' ')}
                  </span>
                </div>
                {rec.effort && (
                  <p className="text-xs text-muted-foreground">{rec.effort}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Critical'
}
