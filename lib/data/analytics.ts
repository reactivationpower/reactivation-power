import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import type {
  ActivityEvent,
  Participant,
  Video,
  VideoProgress,
} from '@/lib/types'

export interface DashboardStats {
  totalViewers: number
  newViewers7d: number
  totalWatchSeconds: number
  totalSessions: number
  videoCompletions: number
  totalVideos: number
  liveCourses: number
  totalCourses: number
  totalDurationSeconds: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getAdminClient()
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [
    viewers,
    newViewers,
    sessions,
    progress,
    videos,
    courses,
  ] = await Promise.all([
    supabase
      .from('participants')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo),
    supabase.from('sessions').select('id', { count: 'exact', head: true }),
    supabase.from('video_progress').select('seconds_watched, completed'),
    supabase.from('videos').select('duration_seconds'),
    supabase.from('courses').select('status'),
  ])

  const progressRows = progress.data ?? []
  const videoRows = videos.data ?? []
  const courseRows = courses.data ?? []

  return {
    totalViewers: viewers.count ?? 0,
    newViewers7d: newViewers.count ?? 0,
    totalWatchSeconds: progressRows.reduce(
      (sum, p) => sum + Number(p.seconds_watched ?? 0),
      0,
    ),
    totalSessions: sessions.count ?? 0,
    videoCompletions: progressRows.filter((p) => p.completed).length,
    totalVideos: videoRows.length,
    liveCourses: courseRows.filter((c) => c.status === 'live').length,
    totalCourses: courseRows.length,
    totalDurationSeconds: videoRows.reduce(
      (sum, v) => sum + Number(v.duration_seconds ?? 0),
      0,
    ),
  }
}

export interface WatchedVideo extends Video {
  totalSeconds: number
  starts: number
  completions: number
}

export async function getMostWatchedVideos(limit = 6): Promise<WatchedVideo[]> {
  const supabase = getAdminClient()
  const [{ data: videos }, { data: progress }] = await Promise.all([
    supabase.from('videos').select('*'),
    supabase
      .from('video_progress')
      .select('video_id, seconds_watched, completed'),
  ])
  const byVideo = new Map<
    string,
    { totalSeconds: number; starts: number; completions: number }
  >()
  for (const p of progress ?? []) {
    const cur = byVideo.get(p.video_id) ?? {
      totalSeconds: 0,
      starts: 0,
      completions: 0,
    }
    cur.totalSeconds += Number(p.seconds_watched ?? 0)
    cur.starts += 1
    if (p.completed) cur.completions += 1
    byVideo.set(p.video_id, cur)
  }
  return ((videos ?? []) as Video[])
    .map((v) => ({
      ...v,
      ...(byVideo.get(v.id) ?? { totalSeconds: 0, starts: 0, completions: 0 }),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || b.starts - a.starts)
    .slice(0, limit)
}

export interface ViewerRow extends Participant {
  sessionCount: number
  watchSeconds: number
  completedVideos: number
  lastSeen: string | null
  lastIp: string | null
}

export async function getViewerRows(): Promise<ViewerRow[]> {
  const supabase = getAdminClient()
  const [{ data: participants }, { data: sessions }, { data: progress }] =
    await Promise.all([
      supabase
        .from('participants')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('participant_id, last_active_at, ip_address')
        .order('last_active_at', { ascending: false }),
      supabase
        .from('video_progress')
        .select('participant_id, seconds_watched, completed'),
    ])

  const sessionAgg = new Map<
    string,
    { count: number; lastSeen: string; lastIp: string | null }
  >()
  for (const s of sessions ?? []) {
    const cur = sessionAgg.get(s.participant_id)
    if (cur) {
      cur.count += 1
    } else {
      sessionAgg.set(s.participant_id, {
        count: 1,
        lastSeen: s.last_active_at,
        lastIp: s.ip_address,
      })
    }
  }
  const progAgg = new Map<string, { seconds: number; completed: number }>()
  for (const p of progress ?? []) {
    const cur = progAgg.get(p.participant_id) ?? { seconds: 0, completed: 0 }
    cur.seconds += Number(p.seconds_watched ?? 0)
    if (p.completed) cur.completed += 1
    progAgg.set(p.participant_id, cur)
  }

  return ((participants ?? []) as Participant[]).map((p) => ({
    ...p,
    sessionCount: sessionAgg.get(p.id)?.count ?? 0,
    watchSeconds: progAgg.get(p.id)?.seconds ?? 0,
    completedVideos: progAgg.get(p.id)?.completed ?? 0,
    lastSeen: sessionAgg.get(p.id)?.lastSeen ?? null,
    lastIp: sessionAgg.get(p.id)?.lastIp ?? null,
  }))
}

export interface ActivityFilter {
  participantId?: string
  courseId?: string
  moduleId?: string
  eventType?: string
  limit?: number
}

export async function getActivityEvents(
  filter: ActivityFilter = {},
): Promise<ActivityEvent[]> {
  const supabase = getAdminClient()
  let query = supabase
    .from('activity_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 200)
  if (filter.participantId)
    query = query.eq('participant_id', filter.participantId)
  if (filter.courseId) query = query.eq('course_id', filter.courseId)
  if (filter.moduleId) query = query.eq('module_id', filter.moduleId)
  if (filter.eventType) query = query.eq('event_type', filter.eventType)
  const { data } = await query
  return (data ?? []) as ActivityEvent[]
}

export async function getAllProgress(): Promise<VideoProgress[]> {
  const supabase = getAdminClient()
  const { data } = await supabase.from('video_progress').select('*')
  return (data ?? []) as VideoProgress[]
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
