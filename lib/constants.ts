import type { ScoreCategory } from '@/lib/db/types'

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  category_association: 'Category Association',
  retrieval: 'Source Retrieval',
  entity: 'Entity Recognition',
  social_proof: 'Social Proof',
}

export const CATEGORY_DESCRIPTIONS: Record<ScoreCategory, string> = {
  category_association: 'Whether AI models associate your brand with your product category and recommend you in discovery queries.',
  retrieval: 'Whether AI models with web access cite your website as a source in responses.',
  entity: 'How well AI models understand and represent your entity — schema markup, profile completeness, and description consistency.',
  social_proof: 'The volume and quality of third-party social proof signals that AI models use to validate your authority.',
}

export const SCORE_WEIGHTS: Record<string, number> = {
  category_association: 0.50,
  social_proof: 0.20,
  retrieval: 0.20,
  entity: 0.10,
}

export const COMPONENT_MAX: Record<string, number> = {
  // category_association (total 100)
  discovery_mention_rate: 40,
  avg_mention_position: 20,
  competitor_gap: 20,
  cross_platform_consistency: 20,
  // retrieval (total 100)
  mention_rate: 30,
  direct_url_citation: 30,
  roundup_presence: 20,
  content_format: 20,
  // entity (total 100)
  schema_markup: 20,
  description_specificity: 10,
  profile_completeness: 20,
  wikipedia: 10,
  description_consistency: 40,
  // social_proof — saas (total 100)
  g2_presence: 25,
  capterra_presence: 15,
  product_hunt: 15,
  // social_proof — consumer (total 100)
  amazon_reviews: 30,
  trustpilot_presence: 20,
  youtube_reviews: 5,
  // social_proof — health_wellness (total 100)
  editorial_mentions: 10,
  // social_proof — fintech (total 100)
  app_reviews: 10,
  // social_proof — shared
  reddit_mentions: 20,
  listicle_appearances: 25,
}
