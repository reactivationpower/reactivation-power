export const PUBLIC_APP_ORIGIN = 'https://patientpipeline.app'

/** Public app origin used to build links in emails and invites. */
export function appOrigin(): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/$/, '')
  if (explicit) return explicit
  return PUBLIC_APP_ORIGIN
}
