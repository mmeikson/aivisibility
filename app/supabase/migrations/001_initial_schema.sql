-- Reports: one per URL analysis run
create table reports (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  status text not null default 'pending', -- pending | running | complete | failed
  company_name text,
  category text,
  competitors text[] default '{}',
  inference_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Probes: one per (prompt × platform) pair
create table probes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  prompt_text text not null,
  prompt_type text not null, -- discovery | comparison | job_to_be_done
  platform text not null,    -- openai | anthropic | perplexity | google
  response_text text,
  parsed_json jsonb,         -- was_mentioned, mention_positions, recommendation_strength, competitor_mentions, cited_urls
  citations text[] default '{}',
  latency_ms integer,
  status text not null default 'pending', -- pending | complete | failed
  created_at timestamptz not null default now()
);

-- Scores: one per (report × category)
create table scores (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  category text not null,    -- entity | category_association | retrieval | social_proof
  raw_score integer not null default 0,
  component_scores_json jsonb not null default '{}',
  priority_score numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Recommendations: one per finding, linked to a score
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references scores(id) on delete cascade,
  report_id uuid not null references reports(id) on delete cascade,
  title text not null,
  type text not null,        -- entity | category | retrieval | social_proof
  effort text,               -- e.g. '1-2 days', '2-4 weeks'
  priority numeric not null default 0,
  affected_platforms text[] default '{}',
  why_it_matters text,
  actions text[] default '{}',
  copy_asset_text text,
  created_at timestamptz not null default now()
);

-- Pipeline events: real-time progress stream
create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  event_type text not null,  -- crawl_start | crawl_done | inference_done | probes_start | probe_batch_done | scoring_done | complete | error
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Enable Realtime on pipeline_events
alter publication supabase_realtime add table pipeline_events;

-- Indexes
create index on probes(report_id);
create index on scores(report_id);
create index on recommendations(report_id);
create index on recommendations(score_id);
create index on pipeline_events(report_id);
