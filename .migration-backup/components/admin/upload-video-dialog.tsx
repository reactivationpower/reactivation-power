'use client'

import { useCallback, useRef, useState } from 'react'
import { CheckCircle2, CloudUpload, FileVideo, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/format'

type UploadPhase = 'idle' | 'uploading' | 'saving' | 'done' | 'error'

export function UploadVideoDialog({
  open,
  onOpenChange,
  title,
  accept = 'video/*',
  kindLabel = 'video',
  onUpload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dialog heading, e.g. the video title being uploaded */
  title: string
  accept?: string
  kindLabel?: string
  /**
   * Performs the upload. Receives the file and a progress callback (0-100).
   * Resolve when fully saved; throw to show an error.
   */
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<void>
}) {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = phase === 'uploading' || phase === 'saving'

  const startUpload = useCallback(
    async (selected: File) => {
      setFile(selected)
      setError(null)
      setProgress(0)
      setPhase('uploading')
      try {
        await onUpload(selected, (percent) => {
          setProgress(percent)
          if (percent >= 100) setPhase('saving')
        })
        setProgress(100)
        setPhase('done')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        setPhase('error')
      }
    },
    [onUpload],
  )

  function reset() {
    setPhase('idle')
    setProgress(0)
    setFile(null)
    setError(null)
    setDragActive(false)
  }

  function handleOpenChange(next: boolean) {
    // Closing mid-upload is fine: the upload is managed globally and
    // keeps running in the background (visible in the upload tray).
    if (!next) reset()
    onOpenChange(next)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (busy || phase === 'done') return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) startUpload(dropped)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload {kindLabel}</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>

        {phase === 'done' ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="size-12 text-success" aria-hidden />
            <div>
              <p className="font-medium text-foreground">Upload complete</p>
              {file && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {file.name} · {formatFileSize(file.size)}
                </p>
              )}
            </div>
            <Button onClick={() => handleOpenChange(false)} className="min-w-32">
              Done
            </Button>
          </div>
        ) : busy ? (
          <div className="flex flex-col gap-4 py-6">
            <div className="flex items-center gap-3">
              <FileVideo className="size-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {file?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file ? formatFileSize(file.size) : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {progress}%
              </span>
            </div>
            <Progress value={progress} aria-label="Upload progress" />
            <p className="text-center text-sm text-muted-foreground">
              {phase === 'saving'
                ? 'Processing and saving...'
                : 'Uploading in the background — you can close this window and keep working.'}
            </p>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="mx-auto min-w-32"
            >
              Close &amp; continue in background
            </Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                'flex min-h-52 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragActive
                  ? 'border-accent bg-accent/5'
                  : 'border-input bg-muted/40 hover:border-accent/50 hover:bg-muted',
              )}
            >
              <CloudUpload
                className={cn(
                  'size-10',
                  dragActive ? 'text-accent' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <div>
                <p className="font-medium text-foreground">
                  {dragActive
                    ? 'Drop it here'
                    : `Drag & drop your ${kindLabel} here`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  or click to browse files
                </p>
              </div>
            </button>
            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <X className="size-4 shrink-0" />
                {error}
              </p>
            )}
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0]
            if (selected) startUpload(selected)
            e.target.value = ''
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
