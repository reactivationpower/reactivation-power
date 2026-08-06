'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  Pencil,
  PlayCircle,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  addAttachment,
  deleteAttachment,
  deleteVideo,
  moveVideo,
  updateVideo,
} from '@/app/actions/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { UploadVideoDialog } from '@/components/admin/upload-video-dialog'
import { ThumbnailDialog } from '@/components/admin/thumbnail-dialog'
import {
  captureFrameFromSource,
  readVideoDuration,
  uploadFileWithProgress,
} from '@/lib/upload-client'
import { startManagedUpload, useUpload } from '@/lib/upload-manager'
import { formatDuration } from '@/lib/format'
import { adminMediaUrl } from '@/lib/media'
import type { Attachment, Video } from '@/lib/types'

export function VideoRow({
  video,
  courseId,
  moduleIndex,
  videoIndex,
  isFirst,
  isLast,
  attachments,
}: {
  video: Video
  courseId: string
  moduleIndex: number
  videoIndex: number
  isFirst: boolean
  isLast: boolean
  attachments: Attachment[]
}) {
  const [editing, setEditing] = useState(false)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false)
  const [thumbnailDialogOpen, setThumbnailDialogOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const backfillAttempted = useRef(false)

  const label = `${moduleIndex + 1}.${videoIndex + 1}`
  const videoUploadKey = `video-${video.id}`
  const attachmentUploadKey = `attachment-${video.id}`
  const videoUpload = useUpload(videoUploadKey)
  const attachmentUpload = useUpload(attachmentUploadKey)
  const videoUploading =
    videoUpload?.phase === 'uploading' || videoUpload?.phase === 'saving'
  const attachmentUploading =
    attachmentUpload?.phase === 'uploading' ||
    attachmentUpload?.phase === 'saving'

  // Auto-generate a first-frame thumbnail for videos that don't have one yet
  useEffect(() => {
    if (!video.video_url || video.thumbnail_url || backfillAttempted.current) {
      return
    }
    backfillAttempted.current = true
    let cancelled = false
    ;(async () => {
      try {
        const blob = await captureFrameFromSource(
          adminMediaUrl(video.video_url),
        )
        if (cancelled) return
        const file = new File([blob], `auto-${video.id}.jpg`, {
          type: 'image/jpeg',
        })
        const result = await uploadFileWithProgress(file, 'thumbnail', () => {})
        if (cancelled) return
        const formData = new FormData()
        formData.set('id', video.id)
        formData.set('courseId', courseId)
        formData.set('thumbnailUrl', result.pathname)
        await updateVideo(formData)
      } catch {
        // Silent: admin can still set a thumbnail manually
      }
    })()
    return () => {
      cancelled = true
    }
  }, [video.id, video.video_url, video.thumbnail_url, courseId])

  async function doVideoUpload(
    file: File,
    onProgress: (percent: number) => void,
  ) {
    const [result, duration] = await Promise.all([
      uploadFileWithProgress(file, 'video', onProgress),
      readVideoDuration(file),
    ])
    const formData = new FormData()
    formData.set('id', video.id)
    formData.set('courseId', courseId)
    formData.set('videoUrl', result.pathname)
    if (duration > 0) formData.set('duration', String(duration))

    // Auto-capture the first frame as the thumbnail
    let objectUrl: string | null = null
    try {
      objectUrl = URL.createObjectURL(file)
      const frame = await captureFrameFromSource(objectUrl)
      const thumbFile = new File([frame], `auto-${video.id}.jpg`, {
        type: 'image/jpeg',
      })
      const thumb = await uploadFileWithProgress(thumbFile, 'thumbnail', () => {})
      formData.set('thumbnailUrl', thumb.pathname)
    } catch {
      // Thumbnail generation is best-effort; the video upload still saves
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }

    await updateVideo(formData)
  }

  /** Runs the upload through the global manager so it survives dialog close */
  function handleVideoUpload(
    file: File,
    onProgress: (percent: number) => void,
  ) {
    return startManagedUpload(
      videoUploadKey,
      `${label} ${video.title}`,
      (managerProgress) =>
        doVideoUpload(file, (p) => {
          managerProgress(p)
          onProgress(p)
        }),
    )
  }

  async function doAttachmentUpload(
    file: File,
    onProgress: (percent: number) => void,
  ) {
    const result = await uploadFileWithProgress(file, 'attachment', onProgress)
    const formData = new FormData()
    formData.set('videoId', video.id)
    formData.set('courseId', courseId)
    formData.set('fileUrl', result.pathname)
    formData.set('fileName', result.fileName)
    formData.set('fileSize', String(result.fileSize))
    formData.set('fileType', result.fileType)
    await addAttachment(formData)
  }

  function handleAttachmentUpload(
    file: File,
    onProgress: (percent: number) => void,
  ) {
    return startManagedUpload(
      attachmentUploadKey,
      `${label} ${video.title} (attachment)`,
      (managerProgress) =>
        doAttachmentUpload(file, (p) => {
          managerProgress(p)
          onProgress(p)
        }),
    )
  }

  function save(formData: FormData) {
    formData.set('id', video.id)
    formData.set('courseId', courseId)
    startTransition(async () => {
      await updateVideo(formData)
      setEditing(false)
    })
  }

  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <form action={save} className="flex flex-1 flex-col gap-2">
            <Input name="title" defaultValue={video.title} required />
            <Textarea
              name="description"
              defaultValue={video.description ?? ''}
              placeholder="Video description (optional)"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-accent">
                {label}
              </span>
              <p className="truncate font-medium text-foreground">
                {video.title}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Edit ${video.title}`}
              >
                <Pencil className="size-3.5" />
              </button>
              {video.status === 'draft' && (
                <Badge
                  variant="outline"
                  className="border-input bg-muted text-muted-foreground"
                >
                  Draft
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <PlayCircle className="size-4" />
                {video.duration_seconds
                  ? formatDuration(Number(video.duration_seconds))
                  : '—'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  startTransition(() =>
                    moveVideo(video.id, video.module_id, courseId, 'up'),
                  )
                }
                disabled={isFirst || pending}
                aria-label="Move video up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  startTransition(() =>
                    moveVideo(video.id, video.module_id, courseId, 'down'),
                  )
                }
                disabled={isLast || pending}
                aria-label="Move video down"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setThumbnailDialogOpen(true)}
                disabled={!video.video_url && !video.thumbnail_url}
              >
                <ImageIcon className="size-4" />
                Thumbnail
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setAttachmentDialogOpen(true)}
                disabled={attachmentUploading}
              >
                <FileText className="size-4" />
                {attachmentUploading
                  ? `Attaching ${attachmentUpload?.progress ?? 0}%`
                  : 'Attach'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setVideoDialogOpen(true)}
                disabled={videoUploading}
              >
                <Upload className="size-4" />
                {videoUploading
                  ? videoUpload?.phase === 'saving'
                    ? 'Saving...'
                    : `Uploading ${videoUpload?.progress ?? 0}%`
                  : video.video_url
                    ? 'Replace video'
                    : 'Upload video'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Delete video "${video.title}"?`)) {
                    startTransition(() => deleteVideo(video.id, courseId))
                  }
                }}
                aria-label="Delete video"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {!video.video_url && !editing && (
        <p className="mt-1 text-xs text-muted-foreground">
          No video uploaded yet — learners will see a placeholder.
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
            >
              <FileText className="size-3.5 text-muted-foreground" />
              {attachment.file_name}
              <button
                type="button"
                onClick={() =>
                  startTransition(() =>
                    deleteAttachment(attachment.id, courseId),
                  )
                }
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`Remove ${attachment.file_name}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <UploadVideoDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        title={`${label} ${video.title}`}
        accept="video/*"
        kindLabel="video"
        onUpload={handleVideoUpload}
      />
      <UploadVideoDialog
        open={attachmentDialogOpen}
        onOpenChange={setAttachmentDialogOpen}
        title={`${label} ${video.title}`}
        accept="*"
        kindLabel="attachment"
        onUpload={handleAttachmentUpload}
      />
      <ThumbnailDialog
        open={thumbnailDialogOpen}
        onOpenChange={setThumbnailDialogOpen}
        videoId={video.id}
        courseId={courseId}
        videoTitle={`${label} ${video.title}`}
        videoPathname={video.video_url}
        currentThumbnail={video.thumbnail_url}
      />
    </div>
  )
}
