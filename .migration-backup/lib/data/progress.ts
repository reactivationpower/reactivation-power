import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import type { VideoProgress } from '@/lib/types'
import type { CourseTree, ModuleWithVideos } from './courses'

export async function getProgressForParticipant(
  participantId: string,
  videoIds?: string[],
): Promise<VideoProgress[]> {
  const supabase = getAdminClient()
  let query = supabase
    .from('video_progress')
    .select('*')
    .eq('participant_id', participantId)
  if (videoIds && videoIds.length > 0) query = query.in('video_id', videoIds)
  const { data } = await query
  return (data ?? []) as VideoProgress[]
}

export async function getProgressForParticipants(
  participantIds: string[],
  videoIds?: string[],
): Promise<VideoProgress[]> {
  if (participantIds.length === 0) return []
  const supabase = getAdminClient()
  let query = supabase
    .from('video_progress')
    .select('*')
    .in('participant_id', participantIds)
  if (videoIds && videoIds.length > 0) query = query.in('video_id', videoIds)
  const { data } = await query
  return (data ?? []) as VideoProgress[]
}

export interface VideoState {
  videoId: string
  completed: boolean
  percentWatched: number
  furthestPosition: number
  locked: boolean
}

export interface ModuleState {
  moduleId: string
  locked: boolean
  completedCount: number
  totalCount: number
  videos: VideoState[]
}

export interface CourseProgressState {
  modules: ModuleState[]
  completedVideos: number
  totalVideos: number
  percentComplete: number
}

/**
 * Compute lock states for a learner across a course tree.
 * - Module N is locked until every video in module N-1 is completed.
 * - Within a module, video N is locked until video N-1 is completed.
 * - Modules with zero videos are treated as complete (do not block).
 */
export function computeCourseState(
  tree: Pick<CourseTree, 'modules'>,
  progress: VideoProgress[],
): CourseProgressState {
  const byVideo = new Map(progress.map((p) => [p.video_id, p]))
  const modules: ModuleState[] = []
  let prevModuleComplete = true
  let completedVideos = 0
  let totalVideos = 0

  for (const mod of tree.modules as ModuleWithVideos[]) {
    const moduleLocked = !prevModuleComplete
    const videos: VideoState[] = []
    let completedInModule = 0
    let prevVideoComplete = true

    for (const video of mod.videos) {
      const p = byVideo.get(video.id)
      const completed = p?.completed ?? false
      videos.push({
        videoId: video.id,
        completed,
        percentWatched: Number(p?.percent_watched ?? 0),
        furthestPosition: Number(p?.furthest_position ?? 0),
        locked: moduleLocked || !prevVideoComplete,
      })
      if (completed) completedInModule++
      prevVideoComplete = completed
      totalVideos++
    }

    completedVideos += completedInModule
    const moduleComplete =
      mod.videos.length === 0 || completedInModule === mod.videos.length

    modules.push({
      moduleId: mod.id,
      locked: moduleLocked,
      completedCount: completedInModule,
      totalCount: mod.videos.length,
      videos,
    })

    prevModuleComplete = prevModuleComplete && moduleComplete
  }

  return {
    modules,
    completedVideos,
    totalVideos,
    percentComplete:
      totalVideos === 0 ? 0 : Math.round((completedVideos / totalVideos) * 100),
  }
}
