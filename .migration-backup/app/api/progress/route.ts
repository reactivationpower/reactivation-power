import { type NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { getSession, getClientIp } from '@/lib/auth/session'
import { logEvent } from '@/lib/data/activity'
import { COMPLETION_THRESHOLD } from '@/lib/types'

/**
 * Player heartbeat. Records watch progress and marks completion
 * server-side once percent watched crosses the threshold (~90%).
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 })
  }

  const {
    videoId,
    courseId = null,
    moduleId = null,
    position = 0,
    duration = 0,
    secondsDelta = 0,
    event = 'heartbeat', // heartbeat | start | ended
  } = body as {
    videoId: string
    courseId?: string | null
    moduleId?: string | null
    position?: number
    duration?: number
    secondsDelta?: number
    event?: 'heartbeat' | 'start' | 'ended'
  }

  const supabase = getAdminClient()
  const ip = await getClientIp()

  const { data: existing } = await supabase
    .from('video_progress')
    .select('*')
    .eq('participant_id', session.participantId)
    .eq('video_id', videoId)
    .maybeSingle()

  const furthest = Math.max(Number(existing?.furthest_position ?? 0), position)
  const secondsWatched =
    Number(existing?.seconds_watched ?? 0) +
    Math.max(0, Math.min(secondsDelta, 60))
  const percent =
    duration > 0
      ? Math.min(100, Math.round((furthest / duration) * 100))
      : Number(existing?.percent_watched ?? 0)

  const wasCompleted = existing?.completed ?? false
  const nowCompleted =
    wasCompleted || event === 'ended' || percent >= COMPLETION_THRESHOLD

  const row = {
    participant_id: session.participantId,
    video_id: videoId,
    seconds_watched: secondsWatched,
    furthest_position: furthest,
    percent_watched: percent,
    completed: nowCompleted,
    completed_at: nowCompleted
      ? (existing?.completed_at ?? new Date().toISOString())
      : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('video_progress')
    .upsert(row, { onConflict: 'participant_id,video_id' })

  if (error) {
    console.error('Progress upsert error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  // Keep session activity fresh
  await supabase
    .from('sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session.sessionId)

  if (event === 'start' && !existing) {
    await logEvent({
      participantId: session.participantId,
      sessionId: session.sessionId,
      courseId,
      moduleId,
      videoId,
      eventType: 'video_start',
      ipAddress: ip,
    })
  }

  if (nowCompleted && !wasCompleted) {
    await logEvent({
      participantId: session.participantId,
      sessionId: session.sessionId,
      courseId,
      moduleId,
      videoId,
      eventType: 'video_complete',
      ipAddress: ip,
      metadata: { percent, position: furthest },
    })
  }

  return NextResponse.json({
    completed: nowCompleted,
    percent,
    justCompleted: nowCompleted && !wasCompleted,
  })
}
