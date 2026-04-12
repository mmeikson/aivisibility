import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { runAnalysis } from '@/lib/inngest/run-analysis'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAnalysis],
})
