import { inngest } from './client'
import { updateReport, emitEvent } from '@/lib/db/queries'

export const runAnalysis = inngest.createFunction(
  {
    id: 'run-analysis',
    name: 'Run GEO Analysis',
    triggers: [{ event: 'report/run' }],
    // Limit concurrent reports to control API costs
    concurrency: { limit: 5 },
  },
  async ({ event, step }: { event: { data: { reportId: string } }; step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { reportId } = event.data

    await step.run('mark-running', async () => {
      await updateReport(reportId, { status: 'running' })
      await emitEvent(reportId, 'crawl_start', 'Starting analysis pipeline...')
    })

    // Phases 2–4 will add steps here:
    // step: crawl
    // step: business-understanding
    // step: probe-generation
    // step: fan-out probe execution
    // step: parse responses
    // step: score categories
    // step: generate recommendations

    await step.run('stub-complete', async () => {
      await updateReport(reportId, { status: 'complete', completed_at: new Date().toISOString() })
      await emitEvent(reportId, 'complete', 'Analysis complete')
    })
  }
)
