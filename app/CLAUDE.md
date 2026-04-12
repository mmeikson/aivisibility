# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (localhost:3000) + run `npx inngest-cli@latest dev` in a separate terminal for local Inngest
npm run build      # Production build
npm run lint       # ESLint
npx tsc --noEmit   # Type check without building
```

For local Inngest development, the Inngest Dev Server must be running alongside Next.js:
```bash
npx inngest-cli@latest dev
```

## Architecture

This is a **Next.js 14 App Router** application. The working directory is `/app` inside the repo root (which also contains `geo-prd.md` and `plan.md`).

### Request flow

1. User submits URL → `POST /api/reports` → creates a `reports` row in Supabase, fires `report/run` Inngest event, returns `reportId`
2. Client navigates to `/report/[id]/loading` → subscribes to Supabase Realtime on `pipeline_events` table for live status
3. Inngest executes `lib/inngest/run-analysis.ts` as a step function (phases 2–4 to be implemented)
4. On `complete` event, client redirects to `/report/[id]` (results summary)

### Key directories

- `lib/db/` — Supabase client (`client.ts`), shared TypeScript types (`types.ts`), query helpers (`queries.ts`)
- `lib/inngest/` — Inngest client and event types (`client.ts`), main pipeline function (`run-analysis.ts`)
- `lib/scoring/` — Per-category scoring logic (to be built in Phase 4)
- `app/api/reports/` — POST handler that creates reports and triggers pipeline
- `app/api/inngest/` — Inngest serve handler (registers all functions)
- `app/report/[id]/` — Results page (server component, reads from Supabase)
- `app/report/[id]/loading/` — Progress page (client component, Supabase Realtime)

### Supabase client usage

- **Server-side** (API routes, server components, Inngest functions): use `createServiceClient()` from `lib/db/client.ts`
- **Client-side** (browser components): use `getSupabaseClient()` — lazy singleton. Do NOT import a top-level `supabase` instance; the client must not instantiate at module load time (breaks Next.js static analysis).

### Database schema

See `supabase/migrations/001_initial_schema.sql`. Five tables: `reports`, `probes`, `scores`, `recommendations`, `pipeline_events`. Realtime is enabled on `pipeline_events`.

### Inngest functions

Functions are registered in `app/api/inngest/route.ts`. Use the v4 API: triggers go inside the config object (`triggers: [{ event: '...' }]`), not as a second argument. Step IDs must be stable strings.

### Environment variables

All required keys are listed in `.env.local` (placeholders — fill in before running). Supabase vars prefixed `NEXT_PUBLIC_` are exposed to the browser.
