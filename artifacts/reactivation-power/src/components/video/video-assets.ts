import { apiUrl } from '@/lib/api'
const base = import.meta.env.BASE_URL
export const WALKTHROUGH_PREVIEW_SRC = apiUrl('/public-media/patient-pipeline-walkthrough-preview.mp4')

export const INTRO_VIDEO = {
  src: apiUrl('/public-media/patient-pipeline-introduction.mp4'),
  poster: `${base}videos/patient-pipeline-introduction.jpg`,
  title: 'Patient Pipeline introduction',
  durationSeconds: 146,
}

export const WALKTHROUGH_VIDEO = {
  src: apiUrl('/public-media/patient-pipeline-walkthrough.mp4'),
  poster: `${base}videos/patient-pipeline-walkthrough.jpg`,
  title: 'Patient Pipeline full walkthrough',
  durationSeconds: 240,
}
