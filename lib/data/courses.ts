import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import type { Attachment, Course, Module, Sector, Video } from '@/lib/types'

export interface ModuleWithVideos extends Module {
  videos: Video[]
}

export interface CourseTree extends Course {
  modules: ModuleWithVideos[]
}

export async function getCourses(): Promise<Course[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('courses')
    .select('*')
    .order('sort_order')
    .order('created_at')
  return (data ?? []) as Course[]
}

export async function getCourseById(id: string): Promise<Course | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data as Course | null
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  return data as Course | null
}

/**
 * Full course tree (modules + videos), ordered.
 * @param liveOnly when true, only live modules/videos are included (learner view)
 */
export async function getCourseTree(
  courseId: string,
  liveOnly = false,
): Promise<CourseTree | null> {
  const supabase = getAdminClient()
  const course = await getCourseById(courseId)
  if (!course) return null

  let moduleQuery = supabase
    .from('modules')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order')
    .order('created_at')
  if (liveOnly) moduleQuery = moduleQuery.eq('status', 'live')
  const { data: modules } = await moduleQuery

  const moduleIds = (modules ?? []).map((m) => m.id)
  let videos: Video[] = []
  if (moduleIds.length > 0) {
    let videoQuery = supabase
      .from('videos')
      .select('*')
      .in('module_id', moduleIds)
      .order('sort_order')
      .order('created_at')
    if (liveOnly) videoQuery = videoQuery.eq('status', 'live')
    const { data } = await videoQuery
    videos = (data ?? []) as Video[]
  }

  return {
    ...course,
    modules: (modules ?? []).map((m) => ({
      ...(m as Module),
      videos: videos.filter((v) => v.module_id === m.id),
    })),
  }
}

export async function getAttachmentsForVideos(
  videoIds: string[],
): Promise<Attachment[]> {
  if (videoIds.length === 0) return []
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('attachments')
    .select('*')
    .in('video_id', videoIds)
    .order('created_at')
  return (data ?? []) as Attachment[]
}

/** Course ids an access-owner has been granted */
export async function getAccessibleCourseIds(
  ownerId: string,
): Promise<string[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('participant_id', ownerId)
  return (data ?? []).map((r) => r.course_id as string)
}

/**
 * Industry sectors the access-owner belongs to, derived from their granted
 * courses. Falls back to healthcare so legacy accounts keep working.
 */
export async function getOwnerSectors(ownerId: string): Promise<Sector[]> {
  const ids = await getAccessibleCourseIds(ownerId)
  if (ids.length === 0) return ['healthcare']
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('courses')
    .select('sector')
    .in('id', ids)
  const sectors = [
    ...new Set((data ?? []).map((r) => r.sector as Sector)),
  ]
  return sectors.length > 0 ? sectors : ['healthcare']
}

/** Live courses the given access-owner can see */
export async function getAccessibleCourses(ownerId: string): Promise<Course[]> {
  const ids = await getAccessibleCourseIds(ownerId)
  if (ids.length === 0) return []
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('courses')
    .select('*')
    .in('id', ids)
    .eq('status', 'live')
    .order('sort_order')
  return (data ?? []) as Course[]
}
