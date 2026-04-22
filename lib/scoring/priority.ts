import type { ScoreCategory } from '@/lib/db/types'

// Closability weights from PRD
const CLOSABILITY: Record<ScoreCategory, number> = {
  entity: 0.9,           // fixes take 1-3 days
  retrieval: 0.7,        // 2-6 weeks with content production
  category_association: 0.4, // 2-4 months
  social_proof: 0.2,     // 6+ months
}

// Closability tier dominates (×10000), gap is tiebreaker within tier.
// Guarantees entity (1–3 days) always ranks above retrieval (2–6 weeks),
// which always ranks above category_association, then social_proof.
export function priorityScore(category: ScoreCategory, rawScore: number): number {
  return CLOSABILITY[category] * 10000 + (100 - rawScore)
}

export function severityLabel(score: number): string {
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Critical'
}

export function severityClass(score: number): string {
  if (score >= 80) return 'severity-healthy'
  if (score >= 60) return 'severity-moderate'
  if (score >= 40) return 'severity-weak'
  return 'severity-critical'
}

export function severityBgClass(score: number): string {
  if (score >= 80) return 'severity-bg-healthy'
  if (score >= 60) return 'severity-bg-moderate'
  if (score >= 40) return 'severity-bg-weak'
  return 'severity-bg-critical'
}
