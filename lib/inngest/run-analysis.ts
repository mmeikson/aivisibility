import { inngest } from './client'
import { updateReport, updateProbe, insertProbes, upsertScore, insertRecommendations, deleteRecommendationsByReport, emitEvent, getReport, getProbesByReport, getProbesByPlatform, getScoresByReport } from '@/lib/db/queries'

// Polls the report status every 2s and aborts the controller when the report
// is no longer running (i.e. cancelled). Call stop() when the step completes
// normally so the polling loop exits cleanly.
function startCancellationWatch(reportId: string): { signal: AbortSignal; stop: () => void } {
  const ac = new AbortController()
  let stopped = false
  ;(async () => {
    while (!stopped && !ac.signal.aborted) {
      await new Promise((r) => setTimeout(r, 2000))
      if (stopped || ac.signal.aborted) return
      try {
        const report = await getReport(reportId)
        if (report?.status !== 'running') { ac.abort(); return }
      } catch { /* ignore transient DB errors */ }
    }
  })()
  return { signal: ac.signal, stop: () => { stopped = true; ac.abort() } }
}
import { crawlSite } from '@/lib/crawler'
import { inferAndGenerateProbes } from '@/lib/inference'
import { probeOpenAIDirect, probePerplexity, probeAnthropic, probeGoogleDirect, type OnProbeResult } from './probe-platform'
import { parseProbeResponses } from '@/lib/parse-responses'
import { scoreCategoryAssociation } from '@/lib/scoring/category-association'
import { scoreRetrieval } from '@/lib/scoring/retrieval'
import { scoreEntity } from '@/lib/scoring/entity'
import { scoreSocialProof } from '@/lib/scoring/social-proof'
import { priorityScore } from '@/lib/scoring/priority'
import { generateRecommendations } from '@/lib/recommendations'
import { computeSourceGaps } from '@/lib/analysis/source-gaps'
import { generatePlatformPerceptions } from '@/lib/platform-summaries'

export const runAnalysis = inngest.createFunction(
  {
    id: 'run-analysis',
    name: 'Run GEO Analysis',
    triggers: [{ event: 'report/run' }],
    concurrency: { limit: 5 },
    cancelOn: [{ event: 'report/cancel', match: 'data.reportId' }],
    retries: 2,
  },
  async ({ event, step }: {
    event: { data: { reportId: string } }
    step: {
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
      waitForEvent: <T = unknown>(id: string, opts: { event: string; timeout: string; match?: string }) => Promise<T | null>
    }
  }) => {
    const { reportId } = event.data

    // Step 1: Mark running (crawl_start already emitted by the API route)
    await step.run('mark-running', async () => {
      await updateReport(reportId, { status: 'running' })
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

    // Step 3: Business understanding + probe generation (single Sonnet call)
    let inference = await step.run('business-and-probes', async () => {
      await emitEvent(reportId, 'crawl_done', 'Understanding your business...')

      // Idempotency: probes already inserted from a previous attempt
      const existing = await getProbesByReport(reportId)
      if (existing.length > 0) {
        const report = await getReport(reportId)
        const probeCount = existing.filter(p => p.platform === 'openai').length
        await emitEvent(reportId, 'probes_start', `Running ${probeCount} prompts across 4 platforms...`)
        return report!.inference_json!
      }

      const { inference: inf, probes } = await inferAndGenerateProbes(crawlResult)

      await updateReport(reportId, {
        company_name: inf.company_name,
        category: inf.category,
        competitors: inf.competitors,
        inference_json: inf,
      })
      await emitEvent(reportId, 'inference_done', `Identified: ${inf.company_name} — ${inf.category}`)

      const platforms = ['openai', 'perplexity', 'anthropic', 'google'] as const
      const rows = probes.flatMap((p) =>
        platforms
          .map((platform) => ({
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

      await emitEvent(reportId, 'probes_start', `Running ${probes.length} prompts across 4 platforms...`)
      return inf
    })

    // Step 5: Run all 3 platforms in parallel
    await Promise.all([

      // ---- ChatGPT (parametric) ----
      (async () => {
        await step.run('probe-openai', async () => {
          const probes = await getProbesByPlatform(reportId, 'openai')
          const { signal, stop } = startCancellationWatch(reportId)
          try {
            let done = 0
            await probeOpenAIDirect(probes, async (id, u) => {
              await updateProbe(id, u)
              if (u.status === 'complete' || u.status === 'failed') {
                done++
                await emitEvent(reportId, 'probe_progress', `ChatGPT: ${done} of ${probes.length} responses received`)
              }
            }, signal)
            await emitEvent(reportId, 'probe_batch_done', `ChatGPT: all ${probes.length} responses received`)
          } finally { stop() }
        })
        await step.run('parse-openai', async () => {
          const probes = await getProbesByPlatform(reportId, 'openai')
          const report = await getReport(reportId)
          await parseProbeResponses(probes, inference, report?.url ?? '')
        })
      })(),

      // ---- Perplexity (web-augmented, with citations) ----
      (async () => {
        await step.run('probe-perplexity', async () => {
          const probes = await getProbesByPlatform(reportId, 'perplexity')
          const { signal, stop } = startCancellationWatch(reportId)
          try {
            let done = 0
            await probePerplexity(probes, async (id, u) => {
              await updateProbe(id, u)
              if (u.status === 'complete' || u.status === 'failed') {
                done++
                await emitEvent(reportId, 'probe_progress', `Perplexity: ${done} of ${probes.length} responses received`)
              }
            }, signal)
            await emitEvent(reportId, 'probe_batch_done', `Perplexity: all ${probes.length} responses received`)
          } finally { stop() }
        })
        await step.run('parse-perplexity', async () => {
          const probes = await getProbesByPlatform(reportId, 'perplexity')
          const report = await getReport(reportId)
          await parseProbeResponses(probes, inference, report?.url ?? '')
        })
      })(),

      // ---- Anthropic ----
      (async () => {
        await step.run('probe-anthropic', async () => {
          const probes = await getProbesByPlatform(reportId, 'anthropic')
          const { signal, stop } = startCancellationWatch(reportId)
          try {
            let done = 0
            await probeAnthropic(probes, async (id, u) => {
              await updateProbe(id, u)
              if (u.status === 'complete' || u.status === 'failed') {
                done++
                await emitEvent(reportId, 'probe_progress', `Claude: ${done} of ${probes.length} responses received`)
              }
            }, signal)
            await emitEvent(reportId, 'probe_batch_done', `Claude: all ${probes.length} responses received`)
          } finally { stop() }
        })
        await step.run('parse-anthropic', async () => {
          await emitEvent(reportId, 'probe_batch_done', 'Parsing responses...')
          const probes = await getProbesByPlatform(reportId, 'anthropic')
          const report = await getReport(reportId)
          await parseProbeResponses(probes, inference, report?.url ?? '')
        })
      })(),

      // ---- Gemini ----
      (async () => {
        await step.run('probe-google', async () => {
          const probes = await getProbesByPlatform(reportId, 'google')
          const { signal, stop } = startCancellationWatch(reportId)
          try {
            let done = 0
            await probeGoogleDirect(probes, async (id, u) => {
              await updateProbe(id, u)
              if (u.status === 'complete' || u.status === 'failed') {
                done++
                await emitEvent(reportId, 'probe_progress', `Gemini: ${done} of ${probes.length} responses received`)
              }
            }, signal)
            await emitEvent(reportId, 'probe_batch_done', `Gemini: all ${probes.length} responses received`)
          } finally { stop() }
        })
        await step.run('parse-google', async () => {
          await emitEvent(reportId, 'probe_batch_done', 'Parsing responses...')
          const probes = await getProbesByPlatform(reportId, 'google')
          const report = await getReport(reportId)
          await parseProbeResponses(probes, inference, report?.url ?? '')
        })
      })(),

    ])

    // Step 5.5: Retry failed probes once (disabled)
    await step.run('probe-retry', async () => {
      return
      const allProbes = await getProbesByReport(reportId)
      const failed = allProbes.filter((p) => p.status === 'failed')
      if (failed.length === 0) {
        await emitEvent(reportId, 'probe_batch_done', 'All responses received — preparing analysis...')
        return
      }

      await emitEvent(reportId, 'probe_batch_done', `Retrying ${failed.length} failed probe${failed.length !== 1 ? 's' : ''}...`)

      const byPlatform: Record<string, typeof failed> = {}
      for (const probe of failed) {
        ;(byPlatform[probe.platform] ??= []).push(probe)
      }

      // Cap retries per platform — if many failed it's likely systemic and retrying
      // all of them just delays completion without improving outcomes.
      const MAX_RETRY_PER_PLATFORM = 3
      for (const platform of Object.keys(byPlatform)) {
        byPlatform[platform] = byPlatform[platform].slice(0, MAX_RETRY_PER_PLATFORM)
      }

      const retryResults: Record<string, number> = {}
      const onResult: OnProbeResult = async (id, u) => {
        await updateProbe(id, u)
        if (u.status === 'complete') retryResults[id] = 1
      }

      await Promise.allSettled([
        byPlatform['anthropic']     && probeAnthropic(byPlatform['anthropic'], onResult),
        byPlatform['openai']        && probeOpenAIDirect(byPlatform['openai'], onResult),
        byPlatform['perplexity']    && probePerplexity(byPlatform['perplexity'], onResult),
        byPlatform['google']        && probeGoogleDirect(byPlatform['google'], onResult),
      ].filter(Boolean))

      const recovered = Object.keys(retryResults).length
      const stillFailed = failed.length - recovered
      console.log(`[retry] ${recovered}/${failed.length} recovered; ${stillFailed} still failed`)
      if (stillFailed > 0) {
        const stillFailedProbes = failed.filter(p => !retryResults[p.id])
        console.log(`[retry] still failed:`, stillFailedProbes.map(p => `${p.platform}:${p.id}`).join(', '))
      }
    })

    // Step 6: Parse any remaining unparsed probes (disabled)
    await step.run('parse-responses', async () => {
      return
      const allProbes = await getProbesByReport(reportId)
      const unparsed = allProbes.filter(p => p.status === 'complete' && !p.parsed_json)
      if (unparsed.length > 0) {
        const report = await getReport(reportId)
        await parseProbeResponses(unparsed, inference, report?.url ?? '')
      }
      await emitEvent(reportId, 'scoring_done', 'Responses parsed — ready for scoring')
    })

    // Step 6.5a: Enrich competitor list from probe responses
    // competitor_mentions is extracted from every probe response by the parser.
    // Aggregate by frequency and merge any new names into the report so the
    // competitive ranking chart and recommendations reflect the full landscape.
    inference = await step.run('enrich-competitors', async () => {
      const allProbes = await getProbesByReport(reportId)
      const freq: Record<string, number> = {}
      for (const probe of allProbes) {
        for (const name of probe.parsed_json?.competitor_mentions ?? []) {
          const key = name.trim()
          if (!key) continue
          freq[key] = (freq[key] ?? 0) + 1
        }
      }

      const existing = new Set(inference.competitors.map((c) => c.toLowerCase()))
      const brandName = inference.company_name.toLowerCase()

      const newCompetitors = Object.entries(freq)
        .filter(([name]) => !existing.has(name.toLowerCase()) && !name.toLowerCase().includes(brandName))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name]) => name)

      if (newCompetitors.length === 0) return inference

      const merged = [...inference.competitors, ...newCompetitors]
      const updatedInference = { ...inference, competitors: merged }
      await updateReport(reportId, { competitors: merged, inference_json: updatedInference })
      return updatedInference
    })

    // Steps 6.5c + 7 + 7b: Scoring, platform summaries, and source classification run in parallel.
    // Extracted to variables first — Turbopack/SWC chokes on complex inline
    // async functions passed directly into Promise.all([...]).
    const scoreStep = step.run('score', async () => {
      await emitEvent(reportId, 'scoring_done', 'Scoring your AI visibility...')
      const allProbes = await getProbesByReport(reportId)
      const report = await getReport(reportId)
      if (!report) throw new Error('Report not found')

      const brandDomain = new URL(report.url).hostname.replace(/^www\./, '')

      const [catResult, retResult, entResult, spResult] = await Promise.all([
        Promise.resolve(scoreCategoryAssociation(allProbes, inference.competitors)),
        Promise.resolve(scoreRetrieval(allProbes, brandDomain)),
        Promise.resolve(scoreEntity(allProbes)),
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

    const summaryStep = step.run('platform-summaries', async () => {
      try {
        const allProbes = await getProbesByReport(reportId)
        const perceptions = await generatePlatformPerceptions(allProbes, inference.company_name)
        if (Object.keys(perceptions).length > 0) {
          const summaries = Object.fromEntries(
            Object.entries(perceptions).map(([k, v]) => [k, v.summary])
          )
          await updateReport(reportId, {
            inference_json: {
              ...inference,
              platform_summaries: summaries,
              platform_perceptions: perceptions,
            },
          })
        }
      } catch (err) {
        console.error('[platform-summaries] failed, skipping:', err instanceof Error ? err.message : err)
      }
    })

    const sourceGapStep = step.run('classify-sources', async () => {
      const allProbes = await getProbesByReport(reportId)
      const reportData = await getReport(reportId)
      const ownDomain = (() => { try { return new URL(reportData?.url ?? '').hostname.replace(/^www\./, '') } catch { return '' } })()
      const result = await computeSourceGaps(allProbes, inference.competitors, ownDomain, inference.company_name, inference.category, inference.canonical_description, inference.primary_use_case, inference.target_customer)
      // Store full result so the report page can use Haiku classifications without re-running
      await updateReport(reportId, { inference_json: { ...inference, source_gap: result } })
      return result.citationSummary
    })

    const [scores, , citationSummary] = await Promise.all([scoreStep, summaryStep, sourceGapStep])

    // Step 8: Generate recommendations — single Sonnet call with all scores
    await step.run('recommendations', async () => {
      await emitEvent(reportId, 'scoring_done', 'Generating recommendations...')

      await deleteRecommendationsByReport(reportId)
      const dbScores = await getScoresByReport(reportId)

      try {
        const recs = await generateRecommendations(dbScores, inference, citationSummary)
        // Assign each rec to the score row matching its category
        const scoreByCategory = Object.fromEntries(dbScores.map((s) => [s.category, s]))
        await insertRecommendations(
          recs.map((r) => {
            const score = scoreByCategory[r.type] ?? dbScores[0]
            return { ...r, effort: null, score_id: score.id, report_id: reportId }
          })
        )
      } catch (err) {
        console.error('[recommendations] failed:', err instanceof Error ? err.message : err)
      }

      await updateReport(reportId, { status: 'complete', completed_at: new Date().toISOString() })
      await emitEvent(reportId, 'complete', 'Analysis complete')
    })
  }
)
