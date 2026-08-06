'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { MAX_STAFF } from '@/lib/types'

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ---------- Courses ----------

export async function createCourse(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rawSector = String(formData.get('sector') ?? 'healthcare')
  const sector = rawSector === 'home_services' ? 'home_services' : 'healthcare'
  if (!title) return { error: 'Title is required' }

  const supabase = getAdminClient()
  let slug = slugify(title)
  const { data: taken } = await supabase
    .from('courses')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (taken) slug = `${slug}-${Date.now().toString(36)}`

  const { data, error } = await supabase
    .from('courses')
    .insert({ title, description: description || null, slug, sector })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/courses')
  return { id: data.id }
}

export async function updateCourse(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const patch: Record<string, unknown> = {}
  for (const key of ['title', 'description', 'status'] as const) {
    const v = formData.get(key)
    if (v !== null) patch[key] = String(v).trim() || null
  }
  if (!id) return { error: 'Missing id' }
  const supabase = getAdminClient()
  const { error } = await supabase.from('courses').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/courses')
  revalidatePath(`/admin/courses/${id}`)
  return {}
}

export async function deleteCourse(id: string) {
  const supabase = getAdminClient()
  await supabase.from('courses').delete().eq('id', id)
  revalidatePath('/admin/courses')
}

// ---------- Modules ----------

export async function createModule(formData: FormData) {
  const courseId = String(formData.get('courseId') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  if (!courseId || !title) return { error: 'Title is required' }

  const supabase = getAdminClient()
  const { count } = await supabase
    .from('modules')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)

  const { error } = await supabase.from('modules').insert({
    course_id: courseId,
    title,
    description: description || null,
    sort_order: count ?? 0,
    status: 'live',
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/courses/${courseId}`)
  return {}
}

export async function updateModule(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const courseId = String(formData.get('courseId') ?? '')
  const patch: Record<string, unknown> = {}
  for (const key of ['title', 'description', 'status'] as const) {
    const v = formData.get(key)
    if (v !== null) patch[key] = String(v).trim() || null
  }
  if (!id) return { error: 'Missing id' }
  const supabase = getAdminClient()
  const { error } = await supabase.from('modules').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/courses/${courseId}`)
  return {}
}

export async function deleteModule(id: string, courseId: string) {
  const supabase = getAdminClient()
  await supabase.from('modules').delete().eq('id', id)
  revalidatePath(`/admin/courses/${courseId}`)
}

export async function moveModule(
  id: string,
  courseId: string,
  direction: 'up' | 'down',
) {
  const supabase = getAdminClient()
  const { data: modules } = await supabase
    .from('modules')
    .select('id, sort_order')
    .eq('course_id', courseId)
    .order('sort_order')
    .order('created_at')
  if (!modules) return
  const idx = modules.findIndex((m) => m.id === id)
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swap < 0 || swap >= modules.length) return
  await supabase
    .from('modules')
    .update({ sort_order: swap })
    .eq('id', modules[idx].id)
  await supabase
    .from('modules')
    .update({ sort_order: idx })
    .eq('id', modules[swap].id)
  // Normalize
  const { data: all } = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', courseId)
    .order('sort_order')
    .order('created_at')
  if (all) {
    await Promise.all(
      all.map((m, i) =>
        supabase.from('modules').update({ sort_order: i }).eq('id', m.id),
      ),
    )
  }
  revalidatePath(`/admin/courses/${courseId}`)
}

// ---------- Videos ----------

export async function createVideo(formData: FormData) {
  const moduleId = String(formData.get('moduleId') ?? '')
  const courseId = String(formData.get('courseId') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const videoUrl = String(formData.get('videoUrl') ?? '').trim()
  const duration = Number(formData.get('duration') ?? 0)
  if (!moduleId || !title) return { error: 'Title is required' }

  const supabase = getAdminClient()
  const { count } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('module_id', moduleId)

  const { error } = await supabase.from('videos').insert({
    module_id: moduleId,
    title,
    description: description || null,
    video_url: videoUrl || null,
    duration_seconds: duration > 0 ? duration : null,
    sort_order: count ?? 0,
    status: 'live',
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/courses/${courseId}`)
  return {}
}

export async function updateVideo(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const courseId = String(formData.get('courseId') ?? '')
  const patch: Record<string, unknown> = {}
  for (const key of ['title', 'description', 'status'] as const) {
    const v = formData.get(key)
    if (v !== null) patch[key] = String(v).trim() || null
  }
  const videoUrl = formData.get('videoUrl')
  if (videoUrl !== null) patch.video_url = String(videoUrl).trim() || null
  const thumbnailUrl = formData.get('thumbnailUrl')
  if (thumbnailUrl !== null)
    patch.thumbnail_url = String(thumbnailUrl).trim() || null
  const duration = formData.get('duration')
  if (duration !== null && Number(duration) > 0)
    patch.duration_seconds = Number(duration)
  if (!id) return { error: 'Missing id' }
  const supabase = getAdminClient()
  const { error } = await supabase.from('videos').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/courses/${courseId}`)
  return {}
}

export async function deleteVideo(id: string, courseId: string) {
  const supabase = getAdminClient()
  await supabase.from('videos').delete().eq('id', id)
  revalidatePath(`/admin/courses/${courseId}`)
}

export async function moveVideo(
  id: string,
  moduleId: string,
  courseId: string,
  direction: 'up' | 'down',
) {
  const supabase = getAdminClient()
  const { data: videos } = await supabase
    .from('videos')
    .select('id, sort_order')
    .eq('module_id', moduleId)
    .order('sort_order')
    .order('created_at')
  if (!videos) return
  const idx = videos.findIndex((v) => v.id === id)
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swap < 0 || swap >= videos.length) return
  const { data: all } = await supabase
    .from('videos')
    .select('id')
    .eq('module_id', moduleId)
    .order('sort_order')
    .order('created_at')
  if (all) {
    const order = all.map((v) => v.id)
    ;[order[idx], order[swap]] = [order[swap], order[idx]]
    await Promise.all(
      order.map((vid, i) =>
        supabase.from('videos').update({ sort_order: i }).eq('id', vid),
      ),
    )
  }
  revalidatePath(`/admin/courses/${courseId}`)
}

// ---------- Attachments ----------

export async function addAttachment(formData: FormData) {
  const videoId = String(formData.get('videoId') ?? '')
  const courseId = String(formData.get('courseId') ?? '')
  const fileUrl = String(formData.get('fileUrl') ?? '')
  const fileName = String(formData.get('fileName') ?? '')
  const fileSize = Number(formData.get('fileSize') ?? 0)
  const fileType = String(formData.get('fileType') ?? '')
  if (!videoId || !fileUrl || !fileName) return { error: 'Missing fields' }

  const supabase = getAdminClient()
  const { error } = await supabase.from('attachments').insert({
    video_id: videoId,
    file_url: fileUrl,
    file_name: fileName,
    file_size: fileSize || null,
    file_type: fileType || null,
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/courses/${courseId}`)
  return {}
}

export async function deleteAttachment(id: string, courseId: string) {
  const supabase = getAdminClient()
  await supabase.from('attachments').delete().eq('id', id)
  revalidatePath(`/admin/courses/${courseId}`)
}

// ---------- Participants ----------

export async function createParticipant(formData: FormData) {
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const phone = String(formData.get('phone') ?? '').trim()
  const parentId = String(formData.get('parentId') ?? '') || null

  if (!firstName || !lastName || !email) {
    return { error: 'First name, last name, and email are required' }
  }

  const supabase = getAdminClient()

  if (parentId) {
    const { count } = await supabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', parentId)
    if ((count ?? 0) >= MAX_STAFF) {
      return { error: `Staff limit reached (max ${MAX_STAFF} per participant)` }
    }
  }

  const { data, error } = await supabase
    .from('participants')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      parent_id: parentId,
      role: parentId ? 'staff' : 'owner',
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505')
      return { error: 'A participant with this email already exists' }
    return { error: error.message }
  }
  revalidatePath('/admin/participants')
  return { id: data.id }
}

export async function updateParticipant(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing id' }
  const patch: Record<string, unknown> = {}
  const map: Record<string, string> = {
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
  }
  for (const [field, col] of Object.entries(map)) {
    const v = formData.get(field)
    if (v !== null) {
      const val = String(v).trim()
      patch[col] = col === 'email' ? val.toLowerCase() : val || null
    }
  }
  const isActive = formData.get('isActive')
  if (isActive !== null) patch.is_active = isActive === 'true'

  const supabase = getAdminClient()
  const { error } = await supabase
    .from('participants')
    .update(patch)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/participants')
  revalidatePath(`/admin/participants/${id}`)
  return {}
}

export async function deleteParticipant(id: string) {
  const supabase = getAdminClient()
  await supabase.from('participants').delete().eq('id', id)
  revalidatePath('/admin/participants')
}

// ---------- Course access ----------

export async function setCourseAccess(
  participantId: string,
  courseId: string,
  granted: boolean,
) {
  const supabase = getAdminClient()
  if (granted) {
    await supabase
      .from('course_access')
      .upsert(
        { participant_id: participantId, course_id: courseId },
        { onConflict: 'course_id,participant_id' },
      )
  } else {
    await supabase
      .from('course_access')
      .delete()
      .eq('participant_id', participantId)
      .eq('course_id', courseId)
  }
  revalidatePath(`/admin/participants/${participantId}`)
  revalidatePath('/admin/participants')
}
