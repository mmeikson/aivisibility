import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await inngest.send({ name: 'report/cancel', data: { reportId: id } })
  return NextResponse.json({ ok: true })
}
