import { NextRequest, NextResponse } from 'next/server'
import { getProbesByPlatform, updateProbe } from '@/lib/db/queries'
import { inngest } from '@/lib/inngest/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bdText(obj: any): string {
  return obj?.answer_text_markdown?.trim() || obj?.answer_text?.trim() || ''
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const probeId = searchParams.get('probeId')
  const reportId = searchParams.get('reportId')
  const platform = searchParams.get('platform')

  if (!probeId || !reportId || !platform) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Parse BD result and update probe
  try {
    const payload = await req.json()
    const result = Array.isArray(payload) ? payload[0] : payload
    const text = bdText(result)

    if (text) {
      const citations = ((result?.citations ?? []) as { url?: string }[])
        .map((c) => c.url ?? '')
        .filter(Boolean)
      await updateProbe(probeId, { response_text: text, citations, status: 'complete' })
      console.log(`[bd-webhook] probe ${probeId} (${platform}) complete, text_len=${text.length}`)
    } else {
      console.warn(`[bd-webhook] empty response for probe ${probeId} (${platform})`)
      await updateProbe(probeId, { status: 'failed' })
    }
  } catch (err) {
    console.error(`[bd-webhook] error for probe ${probeId}:`, err)
    await updateProbe(probeId, { status: 'failed' })
  }

  // Fire completion event when all probes for this platform are done
  const probes = await getProbesByPlatform(reportId, platform)
  const pending = probes.filter((p) => p.status === 'pending').length

  if (pending === 0) {
    const eventName = platform === 'openai' ? 'probes/openai-complete' : 'probes/google-complete'
    await inngest.send({ name: eventName, data: { reportId } })
    console.log(`[bd-webhook] fired ${eventName} for report ${reportId}`)
  } else {
    console.log(`[bd-webhook] ${pending} probes still pending for ${platform}/${reportId}`)
  }

  return NextResponse.json({ ok: true })
}
