import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { runAnalysis } from '@/lib/inngest/run-analysis'

// Allow Inngest step functions up to 5 minutes (Vercel Pro max)
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAnalysis],
})
