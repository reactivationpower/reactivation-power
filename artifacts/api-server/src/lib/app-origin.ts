/** Public app origin used to build links in emails and invites. */
export function appOrigin(): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/$/, '')
  if (explicit) return explicit
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim() || process.env.REPLIT_DEV_DOMAIN
  if (domain) return `https://${domain}`
  return 'http://localhost:5173'
}
