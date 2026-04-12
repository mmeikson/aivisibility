// Smoke test for scoring functions using fixture probe data
// Run with: npx tsx scripts/test-scoring.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { scoreCategoryAssociation } from '../lib/scoring/category-association'
import { scoreRetrieval } from '../lib/scoring/retrieval'
import { scoreEntity } from '../lib/scoring/entity'
import { scoreSocialProof } from '../lib/scoring/social-proof'
import { priorityScore, severityLabel } from '../lib/scoring/priority'
import type { Probe, InferenceResult } from '../lib/db/types'

const INFERENCE: InferenceResult = {
  company_name: 'RentRedi',
  canonical_description: 'Property management software for independent landlords to collect rent, screen tenants, and manage maintenance.',
  category: 'property management software',
  primary_use_case: 'manage rental properties',
  target_customer: 'independent landlords',
  competitors: ['Buildium', 'TurboTenant', 'Avail', 'Cozy', 'AppFolio', 'Rentec Direct'],
  confidence: { company_name: 'high', canonical_description: 'high', category: 'high', primary_use_case: 'high', target_customer: 'high', competitors: 'medium' },
}

// Fixture probes — simulating realistic results
const PROBES: Probe[] = [
  // Discovery — not mentioned on openai/anthropic, mentioned on google
  { id: '1', report_id: 'test', prompt_text: 'Best property management software', prompt_type: 'discovery', platform: 'openai', response_text: 'Buildium, AppFolio...', parsed_json: { was_mentioned: false, mention_positions: [], recommendation_strength: 'none', competitor_mentions: ['Buildium', 'AppFolio'], cited_urls: [], cited_domains: [] }, citations: [], latency_ms: 3000, status: 'complete', created_at: '' },
  { id: '2', report_id: 'test', prompt_text: 'Best property management software', prompt_type: 'discovery', platform: 'anthropic', response_text: 'TurboTenant, Avail...', parsed_json: { was_mentioned: false, mention_positions: [], recommendation_strength: 'none', competitor_mentions: ['TurboTenant', 'Avail'], cited_urls: [], cited_domains: [] }, citations: [], latency_ms: 5000, status: 'complete', created_at: '' },
  { id: '3', report_id: 'test', prompt_text: 'Best property management software', prompt_type: 'discovery', platform: 'google', response_text: 'RentRedi is a great option...', parsed_json: { was_mentioned: true, mention_positions: [3], recommendation_strength: 'confident', competitor_mentions: ['Buildium', 'TurboTenant'], cited_urls: ['https://rentredi.com'], cited_domains: ['rentredi.com'] }, citations: ['https://rentredi.com'], latency_ms: 4000, status: 'complete', created_at: '' },
  { id: '4', report_id: 'test', prompt_text: 'Best property management software', prompt_type: 'discovery', platform: 'perplexity', response_text: 'RentRedi stands out...', parsed_json: { was_mentioned: true, mention_positions: [2], recommendation_strength: 'confident', competitor_mentions: ['Buildium'], cited_urls: ['https://rentredi.com/blog'], cited_domains: ['rentredi.com'] }, citations: ['https://rentredi.com/blog'], latency_ms: 3500, status: 'complete', created_at: '' },
  // Comparison — mentioned in all
  { id: '5', report_id: 'test', prompt_text: 'RentRedi vs Buildium', prompt_type: 'comparison', platform: 'openai', response_text: 'RentRedi vs Buildium comparison...', parsed_json: { was_mentioned: true, mention_positions: [1], recommendation_strength: 'confident', competitor_mentions: ['Buildium'], cited_urls: [], cited_domains: [] }, citations: [], latency_ms: 3000, status: 'complete', created_at: '' },
  { id: '6', report_id: 'test', prompt_text: 'RentRedi vs Buildium', prompt_type: 'comparison', platform: 'anthropic', response_text: 'RentRedi vs Buildium...', parsed_json: { was_mentioned: true, mention_positions: [1], recommendation_strength: 'hedged', competitor_mentions: ['Buildium'], cited_urls: [], cited_domains: [] }, citations: [], latency_ms: 5000, status: 'complete', created_at: '' },
  // Job-to-be-done — not mentioned
  { id: '7', report_id: 'test', prompt_text: 'How to collect rent online', prompt_type: 'job_to_be_done', platform: 'openai', response_text: 'You can use Venmo, Zelle...', parsed_json: { was_mentioned: false, mention_positions: [], recommendation_strength: 'none', competitor_mentions: ['TurboTenant'], cited_urls: [], cited_domains: [] }, citations: [], latency_ms: 3000, status: 'complete', created_at: '' },
  { id: '8', report_id: 'test', prompt_text: 'How to collect rent online', prompt_type: 'job_to_be_done', platform: 'anthropic', response_text: 'Consider using Avail...', parsed_json: { was_mentioned: false, mention_positions: [], recommendation_strength: 'none', competitor_mentions: ['Avail'], cited_urls: [], cited_domains: [] }, citations: [], latency_ms: 5000, status: 'complete', created_at: '' },
]

async function main() {
  console.log('\n=== Scoring Smoke Test ===\n')

  // Category Association
  const catResult = scoreCategoryAssociation(PROBES, INFERENCE.competitors)
  console.log('Category Association Score:', catResult.raw_score, `(${severityLabel(catResult.raw_score)})`)
  console.log('  Components:', catResult.component_scores_json)

  // Retrieval
  const retResult = scoreRetrieval(PROBES, 'rentredi.com')
  console.log('\nRetrieval Score:', retResult.raw_score, `(${severityLabel(retResult.raw_score)})`)
  console.log('  Components:', retResult.component_scores_json)

  // Entity (requires SerpAPI — will show 0s if key missing)
  console.log('\nEntity Score: (running SerpAPI checks...)')
  const entResult = await scoreEntity(INFERENCE, '')
  console.log('  Score:', entResult.raw_score, `(${severityLabel(entResult.raw_score)})`)
  console.log('  Components:', entResult.component_scores_json)

  // Social Proof (requires SerpAPI)
  console.log('\nSocial Proof Score: (running SerpAPI checks...)')
  const spResult = await scoreSocialProof(INFERENCE)
  console.log('  Score:', spResult.raw_score, `(${severityLabel(spResult.raw_score)})`)
  console.log('  Components:', spResult.component_scores_json)

  // Priority scores
  console.log('\n=== Priority Scores ===\n')
  const scores = [
    { category: 'category_association' as const, raw: catResult.raw_score },
    { category: 'retrieval' as const, raw: retResult.raw_score },
    { category: 'entity' as const, raw: entResult.raw_score },
    { category: 'social_proof' as const, raw: spResult.raw_score },
  ]
  scores
    .map((s) => ({ ...s, priority: priorityScore(s.category, s.raw) }))
    .sort((a, b) => b.priority - a.priority)
    .forEach((s) => console.log(`  ${s.category.padEnd(22)} score=${s.raw} priority=${s.priority.toFixed(1)}`))
}

main().catch(console.error)
