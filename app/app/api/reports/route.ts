import { NextRequest, NextResponse } from 'next/server'
import { createReport } from '@/lib/db/queries'
import { inngest } from '@/lib/inngest/client'

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Normalize URL
  let normalizedUrl = url.trim()
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = `https://${normalizedUrl}`
  }

  try {
    new URL(normalizedUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const report = await createReport(normalizedUrl)

  // Trigger the Inngest pipeline
  await inngest.send({ name: 'report/run', data: { reportId: report.id } })

  return NextResponse.json({ reportId: report.id }, { status: 201 })
}
