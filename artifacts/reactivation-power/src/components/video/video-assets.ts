const base = import.meta.env.BASE_URL

export const INTRO_VIDEO = {
  src: `${base}videos/patient-pipeline-introduction.mp4`,
  poster: `${base}videos/patient-pipeline-introduction.jpg`,
  title: 'Patient Pipeline introduction',
  durationSeconds: 146,
}

export const WALKTHROUGH_VIDEO = {
  src: `${base}videos/patient-pipeline-walkthrough.mp4`,
  poster: `${base}videos/patient-pipeline-walkthrough.jpg`,
  title: 'Patient Pipeline full walkthrough',
  durationSeconds: 240,
}
