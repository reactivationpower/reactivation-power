import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import type { ActivityEventType } from '@/lib/types'

export interface LogEventInput {
  participantId: string
  sessionId?: string | null
  courseId?: string | null
  moduleId?: string | null
  videoId?: string | null
  eventType: ActivityEventType
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
}

export async function logEvent(input: LogEventInput): Promise<void> {
  const supabase = getAdminClient()
  await supabase.from('activity_events').insert({
    participant_id: input.participantId,
    session_id: input.sessionId ?? null,
    course_id: input.courseId ?? null,
    module_id: input.moduleId ?? null,
    video_id: input.videoId ?? null,
    event_type: input.eventType,
    metadata: input.metadata ?? null,
    ip_address: input.ipAddress ?? null,
  })
}
