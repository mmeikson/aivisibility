export type ReportStatus = 'pending' | 'running' | 'complete' | 'failed'
export type Platform = 'openai' | 'anthropic' | 'perplexity' | 'google'
export type PromptType = 'discovery' | 'comparison' | 'job_to_be_done' | 'pairwise' | 'entity_check' | 'ranking'
export type ScoreCategory = 'entity' | 'category_association' | 'retrieval' | 'social_proof'
export type ProbeStatus = 'pending' | 'complete' | 'failed'

export type PipelineEventType =
  | 'crawl_start'
  | 'crawl_done'
  | 'inference_done'
  | 'probes_start'
  | 'probe_progress'
  | 'probe_batch_done'
  | 'scoring_done'
  | 'complete'
  | 'error'

export interface Report {
  id: string
  url: string
  status: ReportStatus
  company_name: string | null
  category: string | null
  competitors: string[]
  inference_json: InferenceResult | null
  user_id: string | null
  created_at: string
  completed_at: string | null
}

export interface InferenceResult {
  company_name: string
  canonical_description: string
  category: string
  primary_use_case: string
  target_customer: string
  competitors: string[]
  confidence: Record<string, 'low' | 'medium' | 'high'>
  platform_summaries?: Record<string, string>
}

export interface ParsedProbeResult {
  was_mentioned: boolean
  mention_positions: number[]
  recommendation_strength: 'none' | 'hedged' | 'confident'
  competitor_mentions: string[]
  cited_urls: string[]
  cited_domains: string[]
  entity_confused: boolean
  confused_with: string | null
}

export interface Probe {
  id: string
  report_id: string
  prompt_text: string
  prompt_type: PromptType
  platform: Platform
  response_text: string | null
  parsed_json: ParsedProbeResult | null
  citations: string[]
  latency_ms: number | null
  status: ProbeStatus
  created_at: string
}

export interface Score {
  id: string
  report_id: string
  category: ScoreCategory
  raw_score: number
  component_scores_json: Record<string, number>
  priority_score: number
  created_at: string
}

export interface Recommendation {
  id: string
  score_id: string
  report_id: string
  title: string
  type: ScoreCategory
  effort: string | null
  priority: number
  affected_platforms: string[]
  why_it_matters: string | null
  actions: string[]
  copy_asset_text: string | null
  created_at: string
}

export interface PipelineEvent {
  id: string
  report_id: string
  event_type: PipelineEventType
  message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
