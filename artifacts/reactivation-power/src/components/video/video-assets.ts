import { apiUrl } from '@/lib/api'
const base = import.meta.env.BASE_URL
// 'static' on Vercel builds (CDN serves /videos/ with range support); the API's
// bounded range route on Replit, whose published proxy caps response size.
const staticVideos = import.meta.env.VITE_PUBLIC_VIDEO_SOURCE === 'static'
export function publicVideoSrc(name: string, useStatic = staticVideos) {
  return useStatic ? `${base}videos/${name}` : apiUrl(`/public-media/${name}`)
}
export const WALKTHROUGH_PREVIEW_SRC = publicVideoSrc('patient-pipeline-walkthrough-preview.mp4')

export const INTRO_VIDEO = {
  src: publicVideoSrc('patient-pipeline-introduction.mp4'),
  poster: `${base}videos/patient-pipeline-introduction.jpg`,
  title: 'Patient Pipeline introduction',
  durationSeconds: 146,
}

export const WALKTHROUGH_VIDEO = {
  src: publicVideoSrc('patient-pipeline-walkthrough.mp4'),
  poster: `${base}videos/patient-pipeline-walkthrough.jpg`,
  title: 'Patient Pipeline full walkthrough',
  durationSeconds: 240,
}
