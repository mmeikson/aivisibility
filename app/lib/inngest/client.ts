import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'geo-visibility-analyzer' })

// Event type definitions
export type Events = {
  'report/run': {
    data: { reportId: string }
  }
  'report/probe-platform': {
    data: { reportId: string; probeId: string; platform: string }
  }
}
