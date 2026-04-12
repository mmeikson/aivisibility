import { inngest } from './client'
import { updateReport, insertProbes, emitEvent, getReport } from '@/lib/db/queries'
import { crawlSite } from '@/lib/crawler'
import { inferBusinessContext, generateProbes } from '@/lib/inference'

export const runAnalysis = inngest.createFunction(
  {
    id: 'run-analysis',
    name: 'Run GEO Analysis',
    triggers: [{ event: 'report/run' }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }: {
    event: { data: { reportId: string } }
    step: {
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
      sendEvent: (id: string, events: unknown[]) => Promise<void>
    }
  }) => {
    const { reportId } = event.data

    // Step 1: Mark running
    await step.run('mark-running', async () => {
      await updateReport(reportId, { status: 'running' })
      await emitEvent(reportId, 'crawl_start', 'Crawling website...')
    })

    // Step 2: Crawl
    const crawlResult = await step.run('crawl', async () => {
      const report = await getReport(reportId)
      if (!report) throw new Error('Report not found')

      const site = await crawlSite(report.url)

      if (site.pages.length === 0) {
        await emitEvent(reportId, 'error', 'Could not retrieve any content from this website. It may require JavaScript rendering or block automated requests.')
        await updateReport(reportId, { status: 'failed' })
        throw new Error('Crawl returned no pages')
      }

      await emitEvent(reportId, 'crawl_done', `Crawled ${site.pages.length} page${site.pages.length !== 1 ? 's' : ''}`)
      return site
    })

    // Step 3: Business understanding
    const inference = await step.run('business-understanding', async () => {
      await emitEvent(reportId, 'crawl_done', 'Understanding your business...')

      const result = await inferBusinessContext(crawlResult)

      await updateReport(reportId, {
        company_name: result.company_name,
        category: result.category,
        competitors: result.competitors,
        inference_json: result,
      })

      await emitEvent(
        reportId,
        'inference_done',
        `Identified: ${result.company_name} — ${result.category}`
      )

      return result
    })

    // Step 4: Probe generation
    const probes = await step.run('probe-generation', async () => {
      await emitEvent(reportId, 'inference_done', 'Generating test prompts...')

      const generated = await generateProbes(inference)

      // Persist probes (all platforms, status=pending)
      const platforms = ['openai', 'anthropic', 'perplexity', 'google'] as const
      const rows = generated.flatMap((p) =>
        platforms.map((platform) => ({
          report_id: reportId,
          prompt_text: p.prompt_text,
          prompt_type: p.prompt_type,
          platform,
          response_text: null,
          parsed_json: null,
          citations: [] as string[],
          latency_ms: null,
          status: 'pending' as const,
        }))
      )

      const inserted = await insertProbes(rows)

      await emitEvent(
        reportId,
        'probes_start',
        `Generated ${generated.length} prompts — running across 4 AI platforms (${inserted.length} total queries)`
      )

      return inserted
    })

    // Phases 3–4: probe execution, parsing, scoring, recommendations added next
    // Temporary: mark complete so the UI can redirect
    await step.run('stub-complete', async () => {
      await updateReport(reportId, { status: 'complete', completed_at: new Date().toISOString() })
      await emitEvent(reportId, 'complete', `Inference complete — ${probes.length} probes ready to run`)
    })
  }
)
