import { toAppPath } from '@/lib/posthog-public-pages'

/**
 * Keeps one-time links and sign-in tokens out of PostHog.
 *
 * - Sign-in pages opened from an invite, password-setup or access link carry a
 *   token in the address. Those visits are never recorded, until the visitor
 *   moves to another page.
 * - Payment, billing and agreement links have their token in the path. The
 *   token is replaced with ":token" in every address PostHog sees, and any
 *   copy of it in the page (links, text, form values) becomes "[redacted]".
 * - Only known marketing and harmless query values are kept; everything after
 *   "#" is dropped.
 */

export const REDACTED = '[redacted]'

const LOGIN_PAGES = /^\/(login|admin-login|affiliates\/access)$/i
const TOKEN_PATH = /^(\/(?:agreements|billing|pay)\/)([^/]+)(\/.*)?$/i
/** Query values that are safe to keep in addresses sent to PostHog. */
const KEPT_QUERY_KEY = /^(utm_[a-z_]+|ms|ref|gclid|fbclid|msclkid|next|reason)$/i
/**
 * Query keys a sign-in page may carry without it being a token visit.
 * `session` (inactivity logout) is allowed here but never kept in addresses.
 */
const LOGIN_QUERY_KEY = /^(utm_[a-z_]+|ms|ref|gclid|fbclid|msclkid|next|reason|session|email)$/i
const MIN_TOKEN_LENGTH = 12

const knownTokens = new Set<string>()
/** Longest first, so a token that contains another is removed whole. */
let sortedTokens: string[] = []
let lockedPath: string | null = null

function parse(url: string | URL, origin: string): URL | null {
  try { return new URL(url, origin) } catch { return null }
}

function trimPath(path: string): string {
  return path.length > 1 ? path.replace(/\/$/, '') : path
}

/** A sign-in page opened with anything but harmless query values, or with a "#" part. */
export function isTokenLoginVisit(url: URL, baseUrl: string): boolean {
  const appPath = toAppPath(url.pathname, baseUrl)
  if (appPath === null || !LOGIN_PAGES.test(trimPath(appPath))) return false
  if (url.hash.length > 1) return true
  for (const key of url.searchParams.keys()) if (!LOGIN_QUERY_KEY.test(key)) return true
  return false
}

function addToken(value: string | null | undefined) {
  if (!value) return
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { /* keep raw */ }
  for (const candidate of new Set([value, decoded])) {
    if (candidate.length >= MIN_TOKEN_LENGTH) knownTokens.add(candidate)
  }
  sortedTokens = [...knownTokens].sort((a, b) => b.length - a.length)
}

/**
 * Called for every address the browser moves to, before PostHog sees it.
 * Learns token values so they can be redacted, and locks sign-in pages opened
 * from a token link so they stay unrecorded after the token leaves the address.
 */
export function observeUrl(url: string | URL, origin: string, baseUrl: string): void {
  const parsed = parse(url, origin)
  if (!parsed) return
  const appPath = toAppPath(parsed.pathname, baseUrl)
  const tokenPath = appPath === null ? null : TOKEN_PATH.exec(appPath)
  if (tokenPath) addToken(tokenPath[2])
  for (const [key, value] of parsed.searchParams) if (!KEPT_QUERY_KEY.test(key)) addToken(value)
  const hash = parsed.hash.replace(/^#/, '')
  if (hash) {
    if (hash.includes('=')) for (const value of new URLSearchParams(hash).values()) addToken(value)
    else addToken(hash)
  }
  if (isTokenLoginVisit(parsed, baseUrl)) lockedPath = parsed.pathname
  else if (lockedPath !== null && parsed.pathname !== lockedPath) lockedPath = null
}

/** True while the current sign-in page was opened from a token link. */
export function isLockedVisit(url: URL): boolean {
  return lockedPath !== null && url.pathname === lockedPath
}

/** Replaces every known token inside a piece of text. */
export function scrubText(text: string): string {
  if (!text || sortedTokens.length === 0) return text
  let result = text
  for (const token of sortedTokens) if (result.includes(token)) result = result.split(token).join(REDACTED)
  return result
}

/**
 * Same-site addresses: token path segments, unknown query values and "#" parts removed.
 * Other sites: only the site and path are kept.
 */
export function redactUrl(href: string, origin: string, baseUrl: string): string {
  if (href.startsWith('#')) return '#'
  const parsed = parse(href, origin)
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return scrubText(href)
  if (parsed.origin !== new URL(origin).origin) return scrubText(`${parsed.origin}${parsed.pathname}`)
  const base = baseUrl.replace(/\/$/, '')
  const appPath = toAppPath(parsed.pathname, baseUrl)
  if (appPath !== null) {
    const match = TOKEN_PATH.exec(appPath)
    if (match) parsed.pathname = `${base}${match[1]}:token${match[3] ?? ''}`
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (!KEPT_QUERY_KEY.test(key)) parsed.searchParams.delete(key)
  }
  parsed.hash = ''
  // Absolute in, absolute out; a bare path stays a path.
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(href)
  return scrubText(absolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`)
}

/** Redacts tokens and same-site addresses anywhere inside an event's data. */
export function scrubValue(value: unknown, origin: string, baseUrl: string, key = ''): unknown {
  if (typeof value === 'string') {
    if (/pathname$/i.test(key) && value.startsWith('/')) return redactUrl(value, origin, baseUrl)
    if (value.startsWith(origin) || /url$|referrer$|href$/i.test(key)) return redactUrl(value, origin, baseUrl)
    return scrubText(value)
  }
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, origin, baseUrl))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value)) result[childKey] = scrubValue(child, origin, baseUrl, childKey)
    return result
  }
  return value
}

/** Test hooks only. */
export const __redactionTesting = {
  reset() { knownTokens.clear(); sortedTokens = []; lockedPath = null },
}
