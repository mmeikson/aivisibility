import type { ScoreCategory } from '@/lib/db/types'

// Closability weights from PRD
const CLOSABILITY: Record<ScoreCategory, number> = {
  entity: 0.9,           // fixes take 1-3 days
  retrieval: 0.7,        // 2-6 weeks with content production
  category_association: 0.4, // 2-4 months
  social_proof: 0.2,     // 6+ months
}

export function priorityScore(category: ScoreCategory, rawScore: number): number {
  return (100 - rawScore) * CLOSABILITY[category]
}

// Severity label for display
export function severityLabel(score: number): string {
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Critical'
}
