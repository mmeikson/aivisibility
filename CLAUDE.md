# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npx tsc --noEmit   # Type check without building
```

Local Inngest Dev Server must run alongside Next.js in a separate terminal:
```bash
npx inngest-cli@latest dev
```

Set `INNGEST_DEV=1` and `INNGEST_EVENT_KEY=local` in `.env.local` for local mode.

## Architecture

**Next.js 14 App Router** application. Working directory is `/app` inside the repo root.

### Request flow

1. User submits URL → `POST /api/reports` → creates `reports` row (with `user_id` if logged in), fires `report/run` Inngest event
2. Client navigates to `/report/[id]/loading` → Supabase Realtime on `pipeline_events` + 5s polling fallback
3. Inngest executes `lib/inngest/run-analysis.ts` through 8 steps
4. On `complete` event, client redirects to `/report/[id]`

### Pipeline steps (`lib/inngest/run-analysis.ts`)

1. Mark report running, emit `crawl_start`
2. Crawl site (fetch + Cheerio) — homepage, /about, /pricing, /product
3. Business understanding — Claude Sonnet infers company name, category, competitors, description
4. Probe generation — Claude Sonnet generates 5–24 prompts across discovery/comparison/job-to-be-done types
5. Run probes in parallel across 4 platforms (OpenAI, Anthropic, Perplexity, Google)
6. Parse responses — Claude Haiku extracts `was_mentioned`, `mention_positions`, `recommendation_strength`, `competitor_mentions`, `entity_confused`, `confused_with`
7. Score 4 categories (category_association, retrieval, entity, social_proof)
8. Generate recommendations + copy assets per category, mark complete

### Platform probe implementations (`lib/inngest/probe-platform.ts`)

- **OpenAI**: `gpt-4o-search-preview` with live web search. No `temperature` param (unsupported by this model).
- **Anthropic**: `claude-sonnet-4-6` with `web_search_20250305` tool. `temperature: 0`.
- **Perplexity**: `sonar-pro` via OpenAI-compatible API. `temperature: 0`. Rate-limited with 300–600ms jitter.
- **Google**: `gemini-2.5-flash` with `googleSearch` grounding tool. `temperature: 0`. Grounding redirect URLs are resolved to real URLs via HEAD request.

All probes include a system prompt with the current date for recency-aware responses.

### Key directories

- `lib/db/` — Supabase client, TypeScript types, query helpers
- `lib/inngest/` — Inngest client, main pipeline (`run-analysis.ts`), per-platform probe execution (`probe-platform.ts`)
- `lib/scoring/` — Per-category scoring: `category-association.ts`, `retrieval.ts`, `entity.ts`, `social-proof.ts`, `priority.ts`
- `lib/parse-responses.ts` — Claude Haiku batch parser for probe responses
- `lib/recommendations.ts` — Claude Sonnet generates recommendations + copy assets per score
- `lib/inference.ts` — Business context inference and probe generation
- `lib/crawler.ts` — fetch + Cheerio site crawler
- `app/api/reports/` — POST handler (auto-associates with logged-in user)
- `app/api/inngest/` — Inngest serve handler
- `app/report/[id]/` — Results page (server component)
- `app/report/[id]/loading/` — Progress page (client, Realtime)
- `app/report/[id]/[category]/` — Category detail page with recommendations
- `app/auth/` — Email/password + Google OAuth (PKCE via `@supabase/ssr`)
- `app/dashboard/` — Protected page listing user's saved reports
- `components/probe-explorer.tsx` — Tabbed probe results UI with modal, citations, confusion indicators
- `components/recommendation-card.tsx` — Recommendation with copy template modal

### Supabase client usage

- **Server-side** (API routes, server components, Inngest): `createServiceClient()` from `lib/db/client.ts`
- **Client-side** (browser): `getSupabaseClient()` — lazy singleton using `createBrowserClient` from `@supabase/ssr` (stores PKCE verifier in cookies, not localStorage — required for Google OAuth)
- **Auth server helpers**: `getUser()` / `getSession()` from `lib/supabase/server.ts`
- Route protection via `middleware.ts` — redirects `/dashboard` to `/auth` if not logged in

### Database schema

See `supabase/migrations/`. Five core tables: `reports`, `probes`, `scores`, `recommendations`, `pipeline_events`. Migration `002` adds `user_id` to `reports`. Realtime enabled on `pipeline_events`.

`ParsedProbeResult` (stored in `probes.parsed_json`) includes `entity_confused: boolean` and `confused_with: string | null` for detecting AI entity disambiguation failures.

### Scoring

Each category scores 0–100. The `entity` score includes an `entity_disambiguation` component (20 pts) that penalises reports where AI models confuse the brand with another entity. `priority_score` = `(100 - raw_score) × closability_weight` — higher means more impactful to fix.

### Environment variables

Required keys in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `PERPLEXITY_API_KEY`, `INNGEST_DEV`, `INNGEST_EVENT_KEY`. Optional: `SERP_API_KEY` (entity/social proof scoring).
