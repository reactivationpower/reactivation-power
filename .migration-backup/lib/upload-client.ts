'use client'

import { upload } from '@vercel/blob/client'

export interface UploadResult {
  pathname: string
  fileName: string
  fileSize: number
  fileType: string
}

/** Files over this size use multipart upload (parallel parts + retry) */
const MULTIPART_THRESHOLD = 20 * 1024 * 1024 // 20MB

/**
 * Upload a file DIRECTLY to Blob storage from the browser and report
 * progress (0-100). The file never passes through our server — required for
 * large videos (150MB+), since serverless functions cap request bodies at
 * ~4.5MB in production. Large files are split into parts that upload in
 * parallel and retry individually on failure.
 */
export async function uploadFileWithProgress(
  file: File,
  kind: 'video' | 'attachment' | 'thumbnail',
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const blob = await upload(`${kind}s/${safeName}`, file, {
    access: 'private',
    handleUploadUrl: '/api/upload/token',
    contentType: file.type || 'application/octet-stream',
    multipart: file.size > MULTIPART_THRESHOLD,
    onUploadProgress: ({ percentage }) => {
      onProgress(Math.round(percentage))
    },
  })
  return {
    pathname: blob.pathname,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  }
}

export function uploadFile(
  file: File,
  kind: 'video' | 'attachment' | 'thumbnail',
): Promise<UploadResult> {
  return uploadFileWithProgress(file, kind, () => {})
}

/** Draw the current frame of a <video> element to a JPEG blob (max 1280px wide) */
export function captureFrameFromElement(
  video: HTMLVideoElement,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const width = Math.min(video.videoWidth || 1280, 1280)
    const scale = width / (video.videoWidth || width)
    const height = Math.round((video.videoHeight || 720) * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('Canvas not supported'))
    ctx.drawImage(video, 0, 0, width, height)
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))),
      'image/jpeg',
      0.85,
    )
  })
}

/**
 * Load a video source (object URL or same-origin URL), seek to `time`,
 * and capture that frame as a JPEG blob. Used for auto thumbnails.
 * Defaults to 1.5s in — the literal first frame is often black (fade-in).
 */
export function captureFrameFromSource(
  src: string,
  time = 1.5,
  timeoutMs = 20000,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }
    // Large videos can stall decoding — never hang the save step forever
    const timer = setTimeout(
      () => fail('Thumbnail capture timed out'),
      timeoutMs,
    )

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(
        time,
        Number.isFinite(video.duration) ? Math.max(video.duration - 0.1, 0) : time,
      )
    }
    video.onseeked = async () => {
      if (settled) return
      try {
        const blob = await captureFrameFromElement(video)
        settled = true
        cleanup()
        resolve(blob)
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Capture failed')
      }
    }
    video.onerror = () => fail('Could not load video for thumbnail capture')
    video.src = src
  })
}

/** Read the duration of a local video file before upload (0 on failure) */
export function readVideoDuration(
  file: File,
  timeoutMs = 15000,
): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    let settled = false
    const finish = (value: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(value)
    }
    // Never hang the save step if metadata refuses to load
    const timer = setTimeout(() => finish(0), timeoutMs)
    video.onloadedmetadata = () => {
      finish(Number.isFinite(video.duration) ? Math.round(video.duration) : 0)
    }
    video.onerror = () => finish(0)
    video.src = url
  })
}
