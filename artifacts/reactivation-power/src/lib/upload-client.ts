// @ts-nocheck

export interface UploadResult {
  pathname: string
  fileName: string
  fileSize: number
  fileType: string
}

const MULTIPART_THRESHOLD = 20 * 1024 * 1024 // 20MB

export async function uploadFileWithProgress(
  file: File,
  kind: 'video' | 'attachment' | 'thumbnail',
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  throw new Error('File uploads are not implemented in this read-only port.')
}

export function uploadFile(
  file: File,
  kind: 'video' | 'attachment' | 'thumbnail',
): Promise<UploadResult> {
  return uploadFileWithProgress(file, kind, () => {})
}

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
    const timer = setTimeout(() => finish(0), timeoutMs)
    video.onloadedmetadata = () => {
      finish(Number.isFinite(video.duration) ? Math.round(video.duration) : 0)
    }
    video.onerror = () => finish(0)
    video.src = url
  })
}
