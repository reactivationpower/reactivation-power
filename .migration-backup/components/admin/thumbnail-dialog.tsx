'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, ImageIcon, Loader2, Upload } from 'lucide-react'
import { updateVideo } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  captureFrameFromElement,
  uploadFileWithProgress,
} from '@/lib/upload-client'
import { adminMediaUrl } from '@/lib/media'

type Phase = 'idle' | 'saving' | 'done' | 'error'

export function ThumbnailDialog({
  open,
  onOpenChange,
  videoId,
  courseId,
  videoTitle,
  videoPathname,
  currentThumbnail,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoId: string
  courseId: string
  videoTitle: string
  videoPathname: string | null
  currentThumbnail: string | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const busy = phase === 'saving'

  async function saveThumbnail(blob: Blob, fileName: string) {
    setPhase('saving')
    setError(null)
    try {
      const file = new File([blob], fileName, {
        type: blob.type || 'image/jpeg',
      })
      const result = await uploadFileWithProgress(file, 'thumbnail', () => {})
      const formData = new FormData()
      formData.set('id', videoId)
      formData.set('courseId', courseId)
      formData.set('thumbnailUrl', result.pathname)
      const res = await updateVideo(formData)
      if (res?.error) throw new Error(res.error)
      setPhase('done')
      setTimeout(() => {
        setPhase('idle')
        onOpenChange(false)
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save thumbnail')
      setPhase('error')
    }
  }

  async function useCurrentFrame() {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      setError('Video is still loading — try again in a moment.')
      return
    }
    try {
      const blob = await captureFrameFromElement(video)
      await saveThumbnail(blob, `frame-${videoId}.jpg`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture frame')
      setPhase('error')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return
    if (!next) {
      setPhase('idle')
      setError(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Video thumbnail</DialogTitle>
          <DialogDescription className="truncate">
            {videoTitle} — scrub to any frame, then use it as the thumbnail.
          </DialogDescription>
        </DialogHeader>

        {videoPathname ? (
          <video
            ref={videoRef}
            src={adminMediaUrl(videoPathname)}
            controls
            preload="auto"
            playsInline
            crossOrigin="anonymous"
            className="aspect-video w-full rounded-lg bg-black"
            onLoadedMetadata={(e) => {
              // Nudge off 0s so the browser decodes and paints the first frame
              const v = e.currentTarget
              if (v.currentTime === 0) v.currentTime = 0.1
            }}
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            Upload a video first to pick a frame.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {videoPathname && (
              <Button
                onClick={useCurrentFrame}
                disabled={busy}
                className="gap-2"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageIcon className="size-4" />
                )}
                Use this frame
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2 bg-transparent"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Upload custom image
            </Button>
          </div>

          {currentThumbnail && phase === 'idle' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Current:
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={adminMediaUrl(currentThumbnail) || '/placeholder.svg'}
                alt="Current thumbnail"
                className="h-10 w-auto rounded border border-border"
              />
            </div>
          )}
          {phase === 'done' && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" />
              Thumbnail saved
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) saveThumbnail(file, file.name)
            e.target.value = ''
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
