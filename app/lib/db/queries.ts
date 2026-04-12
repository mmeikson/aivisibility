import { createServiceClient } from './client'
import type { Report, Probe, Score, Recommendation, PipelineEvent, PipelineEventType } from './types'

// ---- Reports ----

export async function createReport(url: string): Promise<Report> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('reports')
    .insert({ url, status: 'pending' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getReport(id: string): Promise<Report | null> {
  const db = createServiceClient()
  const { data, error } = await db.from('reports').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function updateReport(id: string, updates: Partial<Report>) {
  const db = createServiceClient()
  const { error } = await db.from('reports').update(updates).eq('id', id)
  if (error) throw error
}

// ---- Probes ----

export async function insertProbes(probes: Omit<Probe, 'id' | 'created_at'>[]): Promise<Probe[]> {
  const db = createServiceClient()
  const { data, error } = await db.from('probes').insert(probes).select()
  if (error) throw error
  return data
}

export async function updateProbe(id: string, updates: Partial<Probe>) {
  const db = createServiceClient()
  const { error } = await db.from('probes').update(updates).eq('id', id)
  if (error) throw error
}

export async function getProbesByReport(reportId: string): Promise<Probe[]> {
  const db = createServiceClient()
  const { data, error } = await db.from('probes').select('*').eq('report_id', reportId)
  if (error) throw error
  return data ?? []
}

export async function getProbesByPlatform(reportId: string, platform: string): Promise<Probe[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('probes')
    .select('*')
    .eq('report_id', reportId)
    .eq('platform', platform)
  if (error) throw error
  return data ?? []
}

// ---- Scores ----

export async function upsertScore(score: Omit<Score, 'id' | 'created_at'>) {
  const db = createServiceClient()
  const { error } = await db.from('scores').upsert(score)
  if (error) throw error
}

export async function getScoresByReport(reportId: string): Promise<Score[]> {
  const db = createServiceClient()
  const { data, error } = await db.from('scores').select('*').eq('report_id', reportId)
  if (error) throw error
  return data ?? []
}

// ---- Recommendations ----

export async function insertRecommendations(recs: Omit<Recommendation, 'id' | 'created_at'>[]) {
  const db = createServiceClient()
  const { error } = await db.from('recommendations').insert(recs)
  if (error) throw error
}

export async function getRecommendationsByReport(reportId: string): Promise<Recommendation[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('recommendations')
    .select('*')
    .eq('report_id', reportId)
    .order('priority', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ---- Pipeline events ----

export async function emitEvent(
  reportId: string,
  eventType: PipelineEventType,
  message?: string,
  metadata?: Record<string, unknown>
) {
  const db = createServiceClient()
  const { error } = await db.from('pipeline_events').insert({
    report_id: reportId,
    event_type: eventType,
    message: message ?? null,
    metadata: metadata ?? null,
  })
  if (error) console.error('Failed to emit pipeline event:', error)
}

export async function getPipelineEvents(reportId: string): Promise<PipelineEvent[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('pipeline_events')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
