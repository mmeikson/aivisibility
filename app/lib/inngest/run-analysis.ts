import { inngest } from './client'
import { updateReport, updateProbe, insertProbes, upsertScore, insertRecommendations, emitEvent, getReport, getProbesByReport, getProbesByPlatform } from '@/lib/db/queries'
import { crawlSite } from '@/lib/crawler'
import { inferBusinessContext, generateProbes } from '@/lib/inference'
import { probeOpenAI, probeAnthropic, probePerplexity, probeGoogle } from './probe-platform'
import { parseProbeResponses } from '@/lib/parse-responses'
import { scoreCategoryAssociation } from '@/lib/scoring/category-association'
import { scoreRetrieval } from '@/lib/scoring/retrieval'
import { scoreEntity } from '@/lib/scoring/entity'
import { scoreSocialProof } from '@/lib/scoring/social-proof'
import { priorityScore } from '@/lib/scoring/priority'
import { generateRecommendations } from '@/lib/recommendations'

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
        await emitEvent(reportId, 'error', 'Could not retrieve any content from this website.')
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

      await emitEvent(reportId, 'inference_done', `Identified: ${result.company_name} — ${result.category}`)
      return result
    })

    // Step 4: Probe generation
    await step.run('probe-generation', async () => {
      await emitEvent(reportId, 'inference_done', 'Generating test prompts...')

      const generated = await generateProbes(inference)
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

      await insertProbes(rows)

      const platformCount = process.env.PERPLEXITY_API_KEY ? 4 : 3
      await emitEvent(
        reportId,
        'probes_start',
        `Running ${generated.length} prompts across ${platformCount} AI platforms...`
      )
    })

    // Step 5: Run all 4 platforms in parallel
    await Promise.all([
      step.run('probe-openai', async () => {
        const probes = await getProbesByPlatform(reportId, 'openai')
        await probeOpenAI(probes, (id, u) => updateProbe(id, u))
        await emitEvent(reportId, 'probe_batch_done', `ChatGPT: ${probes.length} probes complete`)
      }),

      step.run('probe-anthropic', async () => {
        const probes = await getProbesByPlatform(reportId, 'anthropic')
        await probeAnthropic(probes, (id, u) => updateProbe(id, u))
        await emitEvent(reportId, 'probe_batch_done', `Claude: ${probes.length} probes complete`)
      }),

      step.run('probe-perplexity', async () => {
        if (!process.env.PERPLEXITY_API_KEY) {
          await emitEvent(reportId, 'probe_batch_done', 'Perplexity: skipped (no API key)')
          return
        }
        const probes = await getProbesByPlatform(reportId, 'perplexity')
        await probePerplexity(probes, (id, u) => updateProbe(id, u))
        await emitEvent(reportId, 'probe_batch_done', `Perplexity: ${probes.length} probes complete`)
      }),

      step.run('probe-google', async () => {
        const probes = await getProbesByPlatform(reportId, 'google')
        await probeGoogle(probes, (id, u) => updateProbe(id, u))
        await emitEvent(reportId, 'probe_batch_done', `Gemini: ${probes.length} probes complete`)
      }),
    ])

    // Step 6: Parse all responses
    await step.run('parse-responses', async () => {
      await emitEvent(reportId, 'probe_batch_done', 'Parsing responses...')
      const allProbes = await getProbesByReport(reportId)
      await parseProbeResponses(allProbes, inference.company_name)
      await emitEvent(reportId, 'scoring_done', 'Responses parsed — ready for scoring')
    })

    // Step 7: Score all 4 categories
    const scores = await step.run('score', async () => {
      await emitEvent(reportId, 'scoring_done', 'Scoring your AI visibility...')
      const allProbes = await getProbesByReport(reportId)
      const report = await getReport(reportId)
      if (!report) throw new Error('Report not found')

      const brandDomain = new URL(report.url).hostname.replace(/^www\./, '')

      const [catResult, retResult, entResult, spResult] = await Promise.all([
        Promise.resolve(scoreCategoryAssociation(allProbes, inference.competitors)),
        Promise.resolve(scoreRetrieval(allProbes, brandDomain)),
        scoreEntity(inference, ''), // homepage HTML not stored; schema check skipped for now
        scoreSocialProof(inference),
      ])

      const categories = [
        { category: 'category_association' as const, ...catResult },
        { category: 'retrieval' as const, ...retResult },
        { category: 'entity' as const, ...entResult },
        { category: 'social_proof' as const, ...spResult },
      ]

      const scored = categories.map((c) => ({
        report_id: reportId,
        category: c.category,
        raw_score: c.raw_score,
        component_scores_json: c.component_scores_json,
        priority_score: priorityScore(c.category, c.raw_score),
      }))

      await Promise.all(scored.map((s) => upsertScore(s)))
      return scored
    })

    // Step 8: Generate recommendations for each category
    await step.run('recommendations', async () => {
      await emitEvent(reportId, 'scoring_done', 'Generating recommendations...')

      await Promise.all(
        scores.map(async (score) => {
          const recs = await generateRecommendations(
            { ...score, id: '', created_at: '' },
            inference
          )
          await insertRecommendations(
            recs.map((r) => ({ ...r, score_id: '', report_id: reportId }))
          )
        })
      )

      await updateReport(reportId, { status: 'complete', completed_at: new Date().toISOString() })
      await emitEvent(reportId, 'complete', 'Analysis complete')
    })
  }
)
