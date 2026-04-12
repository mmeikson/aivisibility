# GEO Visibility Analyzer — MVP Build Plan

## Context

Building the MVP described in `geo-prd.md`: a web tool that measures brand visibility in AI-generated responses across ChatGPT, Claude, Perplexity, and Gemini, then produces a 4-category diagnostic report with prioritized recommendations and ready-to-use copy assets.

**Scope decisions locked in:**
- Deploy to Vercel → cloud browser service for crawling
- Entity Recognition / Social Proof data sourced via web search proxy (not direct scraping) for MVP
- PDF export deferred to post-launch
- No email gate for MVP — show results immediately

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 14 App Router + Tailwind + shadcn/ui | As specced |
| Database | Supabase (PostgreSQL) | Built-in Realtime for progress updates; Auth ready for v2 |
| Job queue | Inngest | Best-in-class Next.js/Vercel integration; step functions handle the multi-stage pipeline natively |
| Crawler | `fetch` + Cheerio for MVP; upgrade to Browserless.io if needed | Most /about and /pricing pages render key content server-side; avoids browser service costs in v1 |
| AI inference | Claude claude-sonnet-4-6 for generation/judgment; claude-haiku-4-5-20251001 for parsing | Cost optimization: use Haiku for the 80 response-parsing calls (~$0.03 vs ~$0.15 with Sonnet) |
| Platform probes | OpenAI API, Anthropic API, Perplexity API, Google Generative AI | As specced |
| Search | SerpAPI or Google Custom Search JSON API | Used as proxy for social proof and entity data sources |

---

## Database Schema

Four tables matching the PRD data model:

```sql
reports       id, url, status, company_name, category, competitors[], inference_json, created_at
probes        id, report_id, prompt_text, prompt_type, platform, response_text, parsed_json, citations[]
scores        id, report_id, category, raw_score, component_scores_json, priority_score
recommendations  id, score_id, title, type, effort, priority, actions[], copy_asset_text
```

Add a `pipeline_events` table for real-time progress streaming:
```sql
pipeline_events  id, report_id, event_type, message, created_at
```

---

## Architecture Overview

```
URL Entry → POST /api/reports → creates report row → triggers Inngest event
                                                              ↓
                                          [Inngest: run-analysis function]
                                               Step 1: Crawl (fetch + Cheerio)
                                               Step 2: Business understanding (Claude)
                                               Step 3: Probe generation (Claude)
                                               Step 4: Fan-out → 4 platform jobs (parallel)
                                               Step 5: Parse responses (Claude Haiku, batched)
                                               Step 6: Score all 4 categories
                                               Step 7: Generate recommendations + copy assets
                                               Step 8: Mark report complete

Client polls or subscribes via Supabase Realtime on `pipeline_events` for live progress updates.
```

---

## Phased Build Plan

### Phase 1 — Foundation (Day 1)
- Bootstrap Next.js project with Tailwind + shadcn/ui
- Connect Supabase: set up DB schema, generate types
- Install and configure Inngest
- Environment variable structure for all API keys
- Basic routing: `/` (URL entry), `/report/[id]` (results), `/report/[id]/loading` (progress)

### Phase 2 — Inference Pipeline (Days 2–3)
- **Crawler**: `fetch` + Cheerio targeting homepage, /about, /about-us, /pricing, /product. Strip nav/footer/cookie banners by removing common selector patterns. Fallback gracefully if pages 404.
- **Business understanding**: Single Claude call → structured JSON (company_name, canonical_description, category, primary_use_case, target_customer, competitors[4–6], confidence)
- **Probe generation**: Second Claude call → 15–25 probes across discovery / comparison / job-to-be-done types
- Optional "Review inputs" panel (editable before probes run — lower priority, can be stubbed)
- Write inference_json to reports table; emit progress events

### Phase 3 — Probe Engine (Days 3–4)
- Inngest fan-out: for each probe × platform, dispatch a child job
- Platform integrations:
  - OpenAI: gpt-4o, standard chat completion, no retrieval
  - Anthropic: claude-sonnet-4-6, standard completion, no retrieval
  - Perplexity: llama-3.1-sonar-large, web retrieval enabled — **handle rate limits with exponential backoff + jitter; queue Perplexity jobs at max 5 concurrent**
  - Google: gemini-1.5-pro with Grounding enabled, extract citation URLs
- Store each response in `probes` table with full text + citations
- Emit progress events per completed probe batch

### Phase 4 — Scoring (Days 4–5)
- **Response parsing**: Claude Haiku processes each probe response, extracts was_mentioned, mention_positions, recommendation_strength, competitor_mentions, cited_urls. Batch 10 responses per call to reduce cost.
- **Category Association Score**: Computed directly from parsed probe data (mention rates, positions, cross-platform consistency)
- **Retrieval Score**: Computed from Perplexity + Gemini probes, citation rates, URL citation detection
- **Entity Recognition Score (simplified for MVP)**:
  - Schema markup: Check crawled homepage HTML for Organization schema
  - Description specificity: Claude judgment on inferred description
  - Profile completeness: SerpAPI search for "[company] site:g2.com", "site:linkedin.com", "site:crunchbase.com" — presence = listed
  - Description consistency: Fetch top 3 SerpAPI results for company name, embed with Claude, compute similarity (stub embedding with string overlap if needed for MVP)
  - Wikipedia: Wikipedia API lookup by company name
- **Social Proof Score (simplified for MVP)**:
  - Listicle appearances: SerpAPI "best [category]" top 20 results, count brand vs top competitor
  - Reddit: Reddit public search API for brand mentions in past 12 months
  - G2/Capterra: SerpAPI presence check (same approach as Entity profile completeness)
  - Product Hunt: Product Hunt API or web search check
- **Priority score**: `(100 - raw_score) × closability_weight` per PRD formula
- Write to `scores` and `recommendations` tables

### Phase 5 — Results UI (Days 5–7)
- **Progress page**: Live status feed from Supabase Realtime on pipeline_events. Show step-by-step status ("Crawling website... Generating probes... Running 80 AI queries..."). Redirect to results when complete.
- **Summary page** (`/report/[id]`):
  - Header: company name, category, competitor chips, probe count, date
  - 4 score cards (2×2 grid): score number, severity label, one-sentence summary
  - Priority action queue: top 3 recommendations ranked by priority score
- **Category detail view**: slide-over panel
  - Score breakdown table (component → points earned / max)
  - Diagnostic narrative (Claude-generated, company-specific)
  - Ranked recommendation cards (expandable): title, effort, affected platforms, why it matters, action steps, copy asset

### Phase 6 — Error Handling + Deploy (Day 7–8)
- Graceful degradation: if a platform API fails, mark probe as failed and exclude from that platform's score rather than failing the whole report
- Handle crawler failures (JS-heavy sites, 403s) with a user-facing warning
- Vercel deployment with all env vars
- Basic cost guardrail: cap concurrent Inngest jobs per report to avoid runaway API spend
- Error boundary pages

---

## Known Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Vercel function timeout (10s default, 60s max on Pro) | All long-running work runs in Inngest, not in API routes. API routes only trigger events and read results. |
| Playwright not available on Vercel | Using fetch + Cheerio for MVP. If JS-rendered pages become a significant gap, upgrade to Browserless.io cloud API (one env var change). |
| Perplexity rate limits | Dedicated concurrency cap (max 5 concurrent), exponential backoff, and retry logic in Inngest step function |
| Entity/Social proof data accuracy | Explicitly scoped as "web search proxy" for MVP. Accuracy will be lower than v2 with direct scraping, but sufficient to validate the product. |
| Claude Haiku context limits on batched parsing | Cap batch size at 10 responses, monitor token usage, fall back to single-response parsing if needed |
| Competitor inference quality on niche categories | Surface low-confidence inferences in the "Review inputs" panel and allow editing before probes run |
| API cost overruns during development | Use a test mode with 5 probes instead of 20, and mock platform responses for UI development |

---

## Critical Files to Create

```
/app
  /page.tsx                    — URL entry form
  /report/[id]/page.tsx        — Results (redirect to loading if not complete)
  /report/[id]/loading/page.tsx — Progress UI with Realtime
  /report/[id]/[category]/page.tsx — Category detail view
/app/api
  /reports/route.ts            — POST: create report, trigger Inngest
  /inngest/route.ts            — Inngest handler
/lib
  /inngest/
    client.ts
    run-analysis.ts            — Main pipeline function with steps
    probe-platform.ts          — Per-platform probe execution
  /crawler.ts                  — fetch + Cheerio page extraction
  /inference.ts                — Claude calls for business understanding + probe gen
  /scoring/
    entity.ts
    category.ts
    retrieval.ts
    social-proof.ts
    priority.ts
  /db/
    schema.ts                  — Supabase types
    queries.ts
/components
  /score-card.tsx
  /priority-queue.tsx
  /category-detail.tsx
  /recommendation-card.tsx
  /progress-feed.tsx
```

---

## Verification

1. **Unit test scoring formulas** — pure functions, easy to test with fixture data
2. **End-to-end smoke test** — run pipeline against a known URL (e.g., linear.app or notion.so) and verify report generates with reasonable scores
3. **Platform integration test** — call each platform API individually with a simple probe to verify keys work and responses parse correctly
4. **Progress UI test** — use Inngest's local dev server to simulate a slow pipeline and verify progress events render correctly
5. **Error case test** — test with an invalid URL, a 403 crawl, and a failed platform API call to verify graceful degradation
