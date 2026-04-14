import { inngest } from './client'
import { updateReport, updateProbe, insertProbes, upsertScore, insertRecommendations, emitEvent, getReport, getProbesByReport, getProbesByPlatform, getScoresByReport } from '@/lib/db/queries'
import { crawlSite } from '@/lib/crawler'
import { inferBusinessContext, generateProbes } from '@/lib/inference'
import { probeOpenAI, probeAnthropic, probePerplexity, probeGoogle, type OnProbeResult } from './probe-platform'
import { parseProbeResponses } from '@/lib/parse-responses'
import { scoreCategoryAssociation } from '@/lib/scoring/category-association'
import { scoreRetrieval } from '@/lib/scoring/retrieval'
import { scoreEntity } from '@/lib/scoring/entity'
import { scoreSocialProof } from '@/lib/scoring/social-proof'
import { priorityScore } from '@/lib/scoring/priority'
import { generateRecommendations } from '@/lib/recommendations'
import { generatePlatformSummaries } from '@/lib/platform-summaries'

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
        let done = 0
        await probeOpenAI(probes, async (id, u) => {
          await updateProbe(id, u)
          if (u.status === 'complete' || u.status === 'failed') {
            done++
            await emitEvent(reportId, 'probe_progress', `ChatGPT: ${done} of ${probes.length} responses received`)
          }
        })
        await emitEvent(reportId, 'probe_batch_done', `ChatGPT: all ${probes.length} responses received`)
      }),

      step.run('probe-anthropic', async () => {
        const probes = await getProbesByPlatform(reportId, 'anthropic')
        let done = 0
        await probeAnthropic(probes, async (id, u) => {
          await updateProbe(id, u)
          if (u.status === 'complete' || u.status === 'failed') {
            done++
            await emitEvent(reportId, 'probe_progress', `Claude: ${done} of ${probes.length} responses received`)
          }
        })
        await emitEvent(reportId, 'probe_batch_done', `Claude: all ${probes.length} responses received`)
      }),

      step.run('probe-perplexity', async () => {
        if (!process.env.PERPLEXITY_API_KEY && !process.env.BRIGHTDATA_API_KEY) {
          await emitEvent(reportId, 'probe_batch_done', 'Perplexity: skipped (no API key)')
          return
        }
        const probes = await getProbesByPlatform(reportId, 'perplexity')
        let done = 0
        await probePerplexity(probes, async (id, u) => {
          await updateProbe(id, u)
          if (u.status === 'complete' || u.status === 'failed') {
            done++
            await emitEvent(reportId, 'probe_progress', `Perplexity: ${done} of ${probes.length} responses received`)
          }
        })
        await emitEvent(reportId, 'probe_batch_done', `Perplexity: all ${probes.length} responses received`)
      }),

      step.run('probe-google', async () => {
        const probes = await getProbesByPlatform(reportId, 'google')
        let done = 0
        await probeGoogle(probes, async (id, u) => {
          await updateProbe(id, u)
          if (u.status === 'complete' || u.status === 'failed') {
            done++
            await emitEvent(reportId, 'probe_progress', `Gemini: ${done} of ${probes.length} responses received`)
          }
        })
        await emitEvent(reportId, 'probe_batch_done', `Gemini: all ${probes.length} responses received`)
      }),
    ])

    // Step 5.5: Retry failed probes once
    await step.run('probe-retry', async () => {
      const allProbes = await getProbesByReport(reportId)
      const failed = allProbes.filter((p) => p.status === 'failed')
      if (failed.length === 0) return

      await emitEvent(reportId, 'probe_batch_done', `Retrying ${failed.length} failed probe${failed.length !== 1 ? 's' : ''}...`)

      const byPlatform: Record<string, typeof failed> = {}
      for (const probe of failed) {
        ;(byPlatform[probe.platform] ??= []).push(probe)
      }

      const retryResults: Record<string, number> = {}
      const onResult: OnProbeResult = async (id, u) => {
        await updateProbe(id, u)
        if (u.status === 'complete') retryResults[id] = 1
      }

      await Promise.all([
        byPlatform['openai']     && probeOpenAI(byPlatform['openai'], onResult),
        byPlatform['anthropic']  && probeAnthropic(byPlatform['anthropic'], onResult),
        byPlatform['perplexity'] && probePerplexity(byPlatform['perplexity'], onResult),
        byPlatform['google']     && probeGoogle(byPlatform['google'], onResult),
      ].filter(Boolean))

      const recovered = Object.keys(retryResults).length
      const stillFailed = failed.length - recovered
      console.log(`[retry] ${recovered}/${failed.length} recovered; ${stillFailed} still failed`)
      if (stillFailed > 0) {
        const stillFailedProbes = failed.filter(p => !retryResults[p.id])
        console.log(`[retry] still failed:`, stillFailedProbes.map(p => `${p.platform}:${p.id}`).join(', '))
      }
    })

    // Step 6: Parse all responses
    await step.run('parse-responses', async () => {
      await emitEvent(reportId, 'probe_batch_done', 'Parsing responses...')
      const allProbes = await getProbesByReport(reportId)
      const report = await getReport(reportId)
      await parseProbeResponses(allProbes, inference, report?.url ?? '')
      await emitEvent(reportId, 'scoring_done', 'Responses parsed — ready for scoring')
    })

    // Step 6.5: Generate per-platform summaries
    await step.run('platform-summaries', async () => {
      const allProbes = await getProbesByReport(reportId)
      const summaries = await generatePlatformSummaries(allProbes, inference.company_name)
      if (Object.keys(summaries).length > 0) {
        await updateReport(reportId, {
          inference_json: { ...inference, platform_summaries: summaries },
        })
      }
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
        scoreEntity(inference, '', allProbes), // homepage HTML not stored; schema check skipped for now
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

      // Re-fetch scores from DB to get their actual UUIDs
      const dbScores = await getScoresByReport(reportId)

      await Promise.all(
        dbScores.map(async (score) => {
          const recs = await generateRecommendations(score, inference)
          await insertRecommendations(
            recs.map((r) => ({ ...r, score_id: score.id, report_id: reportId }))
          )
        })
      )

      await updateReport(reportId, { status: 'complete', completed_at: new Date().toISOString() })
      await emitEvent(reportId, 'complete', 'Analysis complete')
    })
  }
)
