import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'
import { updateReport } from '@/lib/db/queries'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Mark failed immediately so in-progress probe steps see the status change
  // and abort via their cancellation watchdog.
  await updateReport(id, { status: 'failed' })
  await inngest.send({ name: 'report/cancel', data: { reportId: id } })
  return NextResponse.json({ ok: true })
}
