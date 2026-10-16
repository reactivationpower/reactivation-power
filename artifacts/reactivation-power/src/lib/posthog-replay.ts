import type { CaptureResult, PostHog, PostHogConfig } from 'posthog-js'
import { isPublicPagePath, toAppPath } from '@/lib/posthog-public-pages'
import { isLockedVisit, observeUrl, redactUrl, scrubText, scrubValue } from '@/lib/posthog-redaction'

/**
 * PostHog session replay for PUBLIC pages only (see posthog-public-pages.ts).
 *
 * Owner decisions, confirmed after being told the risks. Do not undo them:
 * - Only allow-listed public pages are recorded. Logged-in areas never are.
 * - Typed values are shown, passwords included (no input or text masking).
 * - Everyone is recorded; Do Not Track and GPC are not honoured for PostHog.
 *   The in-house lead analytics keep their own opt-in and DNT/GPC rules.
 * - No BAA, which is only acceptable because portal pages are never recorded.
 * - Logged-in users are never identified to PostHog.
 *
 * How private pages stay out:
 * - PostHog is downloaded and started only after a public page has rendered.
 *   A visitor who lands on a private page never loads it.
 * - Before the URL changes to a private page (pushState / replaceState / back
 *   button), recording, autocapture and pageviews are switched off
 *   synchronously, so React has not rendered the private page yet.
 * - Coming back, recording restarts only after the public page has rendered.
 * - `before_send` drops every event while switched off, as a second guard.
 * - Sign-in pages opened from a token link are private for that visit, and
 *   one-time link tokens are redacted everywhere (posthog-redaction.ts).
 */

type Env = Record<string, unknown>
type Loader = () => Promise<PostHog>

let env: Env = import.meta.env
let loader: Loader = async () => (await import('posthog-js')).default
let client: PostHog | null = null
let loading = false
let active = false
let lastPublicHref = ''
let lastPageviewHref = ''
let guardInstalled = false

function stringEnv(name: string): string {
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

export function postHogReplayEnabled(): boolean {
  if (typeof window === 'undefined') return false
  // Never starts during tests.
  if (env.MODE === 'test' || env.VITEST) return false
  return Boolean(stringEnv('VITE_POSTHOG_KEY'))
}

function baseUrl(): string {
  return typeof env.BASE_URL === 'string' ? env.BASE_URL : '/'
}

function isPublicUrl(url: string | URL): boolean {
  let parsed: URL
  try { parsed = new URL(url, window.location.href) } catch { return false }
  if (isLockedVisit(parsed)) return false
  const appPath = toAppPath(parsed.pathname, baseUrl())
  return appPath !== null && isPublicPagePath(appPath)
}

function observe(url: string | URL) {
  observeUrl(url, window.location.href, baseUrl())
}

function redact(href: string): string {
  return redactUrl(href, window.location.origin, baseUrl())
}

const OFF: Partial<PostHogConfig> = { disable_session_recording: true, autocapture: false }
const ON: Partial<PostHogConfig> = { disable_session_recording: false, autocapture: true }

function config(): Partial<PostHogConfig> {
  return {
    api_host: stringEnv('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com',
    defaults: '2026-05-30',
    // Pageviews are sent by hand, only for public pages.
    capture_pageview: false,
    capture_pageleave: false,
    // Owner decision: record everyone.
    respect_dnt: false,
    // Anonymous visitors only; nobody is identified.
    person_profiles: 'identified_only',
    // Out of scope, and their buffers could hold data from a private page.
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_performance: false,
    capture_exceptions: false,
    // Addresses may hold one-time link tokens; "#" parts are never sent.
    disable_capture_url_hashes: true,
    enable_recording_console_log: false,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    session_recording: {
      // Owner decision: show every typed value, passwords included. Masking is
      // switched on only so these functions see every value; they return it
      // unchanged except for one-time link tokens.
      maskAllInputs: true,
      maskInputOptions: { password: true },
      maskInputFn: (text) => scrubText(text),
      maskTextSelector: '*',
      maskTextFn: (text) => scrubText(text),
      maskAttributeFn: (name, value) => (/^(href|src|action|formaction)$/i.test(name) ? redact(value) : scrubText(value)),
      // Hidden form fields carry tokens (invite and setup links); never record them.
      blockSelector: 'input[type="hidden"]',
      // Page addresses in the recording, and network requests if enabled in PostHog.
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: redact(request.name),
        requestHeaders: undefined,
        responseHeaders: undefined,
        requestBody: undefined,
        responseBody: undefined,
      }),
    },
    before_send: guardEvent,
  }
}

/** Second guard: nothing leaves the browser unless a public page is showing. */
function guardEvent(event: CaptureResult | null): CaptureResult | null {
  const allowed = allowEvent(event)
  return allowed && scrubEvent(allowed)
}

/** Removes one-time link tokens from every address and value in the event. */
function scrubEvent(event: CaptureResult): CaptureResult {
  const origin = window.location.origin
  const { $snapshot_data: snapshotData, ...rest } = event.properties ?? {}
  const properties = scrubValue(rest, origin, baseUrl()) as Record<string, unknown>
  // Replay data is redacted by the recorder's masking functions before this point.
  if (snapshotData !== undefined) properties.$snapshot_data = snapshotData
  return {
    ...event,
    properties,
    ...(event.$set ? { $set: scrubValue(event.$set, origin, baseUrl()) as CaptureResult['$set'] } : {}),
    ...(event.$set_once ? { $set_once: scrubValue(event.$set_once, origin, baseUrl()) as CaptureResult['$set_once'] } : {}),
  }
}

function allowEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null
  if (active && isPublicUrl(window.location.href)) return event
  // The last bit of a public recording can be sent just after leaving. The
  // recorder was already stopped before the private page rendered, so the
  // data itself is public; only the page address needs to be the public one.
  if (event.event === '$snapshot' && lastPublicHref) {
    const properties: Record<string, unknown> = { ...event.properties, $current_url: lastPublicHref }
    try { properties.$pathname = new URL(lastPublicHref).pathname } catch { delete properties.$pathname }
    return { ...event, properties }
  }
  return null
}

/** Switches PostHog off. Safe to call at any time; does nothing if it never loaded. */
export function leavePublicPage(): void {
  lastPageviewHref = ''
  if (!active) return
  active = false
  client?.set_config(OFF)
}

/** Call after a public page has rendered. Loads PostHog on first use. */
export function enterPublicPage(): void {
  if (!postHogReplayEnabled()) return
  const href = window.location.href
  if (!isPublicUrl(href)) { leavePublicPage(); return }
  lastPublicHref = href
  if (client) {
    if (!active) { active = true; client.set_config(ON) }
    capturePageview(href)
    return
  }
  if (loading) return
  loading = true
  loader().then((posthog) => {
    loading = false
    // The visitor may have moved to a private page while it downloaded.
    if (client || !isPublicUrl(window.location.href)) return
    // Active before init, so events sent during init are not dropped.
    active = true
    lastPublicHref = window.location.href
    posthog.init(stringEnv('VITE_POSTHOG_KEY'), config())
    client = posthog
    capturePageview(window.location.href)
  }).catch((error: unknown) => {
    loading = false
    console.warn('PostHog could not be loaded.', error)
  })
}

function capturePageview(href: string) {
  if (!client || !active || href === lastPageviewHref) return
  lastPageviewHref = href
  client.capture('$pageview')
}

/**
 * Switches PostHog off before the address changes to a private page. Must run
 * before the router renders, so it is installed when the app starts.
 */
export function installPostHogRouteGuard(): void {
  if (guardInstalled || typeof window === 'undefined') return
  guardInstalled = true
  observe(window.location.href)
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method]
    window.history[method] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      if (url != null) {
        observe(url)
        if (!isPublicUrl(url)) leavePublicPage()
      }
      return original.call(this, data, unused, url)
    }
  }
  // Registered before the router subscribes, so it runs first on back/forward.
  window.addEventListener('popstate', () => {
    observe(window.location.href)
    if (!isPublicUrl(window.location.href)) leavePublicPage()
  })
}

/** Test hooks only. */
export const __testing = {
  reset(next: { env?: Env; loader?: Loader } = {}) {
    env = next.env ?? import.meta.env
    loader = next.loader ?? (async () => (await import('posthog-js')).default)
    client = null
    loading = false
    active = false
    lastPublicHref = ''
    lastPageviewHref = ''
  },
  guardEvent,
  isActive: () => active,
}
