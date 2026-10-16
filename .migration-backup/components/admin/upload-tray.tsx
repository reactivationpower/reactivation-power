'use client'

import { CheckCircle2, CloudUpload, X } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { dismissUpload, useUploads } from '@/lib/upload-manager'

/**
 * Floating tray (bottom-right) showing every in-flight upload,
 * so admins can close upload dialogs and keep working while
 * videos upload in the background.
 */
export function UploadTray() {
  const uploads = useUploads()
  const entries = Object.values(uploads)
  if (entries.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      role="status"
      aria-label="Active uploads"
    >
      {entries.map((upload) => (
        <div
          key={upload.id}
          className="rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            {upload.phase === 'done' ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <CloudUpload
                className={
                  upload.phase === 'error'
                    ? 'size-4 shrink-0 text-destructive'
                    : 'size-4 shrink-0 text-accent'
                }
              />
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {upload.label}
            </p>
            {upload.phase === 'uploading' && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {upload.progress}%
              </span>
            )}
            {(upload.phase === 'error' || upload.phase === 'done') && (
              <button
                type="button"
                onClick={() => dismissUpload(upload.id)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Dismiss ${upload.label}`}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {(upload.phase === 'uploading' || upload.phase === 'saving') && (
            <div className="mt-2">
              <Progress
                value={upload.progress}
                aria-label={`${upload.label} upload progress`}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {upload.phase === 'saving'
                  ? 'Processing and saving...'
                  : 'Uploading in background'}
              </p>
            </div>
          )}
          {upload.phase === 'error' && (
            <p className="mt-1 text-xs text-destructive">
              {upload.error ?? 'Upload failed'}
            </p>
          )}
          {upload.phase === 'done' && (
            <p className="mt-1 text-xs text-muted-foreground">
              Upload complete
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
