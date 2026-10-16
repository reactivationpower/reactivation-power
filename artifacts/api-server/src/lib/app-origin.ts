import { isVercel } from './deployment-safety'

export const PUBLIC_APP_ORIGIN = 'https://patientpipeline.app'
const PUBLIC_HOSTS = new Set(['patientpipeline.app', 'www.patientpipeline.app'])

/**
 * Public app origin used to build links in emails and invites.
 *
 * On Vercel only a patientpipeline.app APP_URL is honored: a temporary
 * `*.vercel.app` address must never end up in customer email links, even if
 * someone sets it while testing. Elsewhere APP_URL is used as given.
 */
export function appOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.APP_URL?.trim().replace(/\/$/, '')
  if (!explicit) return PUBLIC_APP_ORIGIN
  if (isVercel(env)) {
    let host: string | null = null
    try { host = new URL(explicit).host.toLowerCase() } catch { host = null }
    return host && PUBLIC_HOSTS.has(host) ? explicit : PUBLIC_APP_ORIGIN
  }
  return explicit
}
