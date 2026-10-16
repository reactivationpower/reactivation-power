/**
 * The ONLY pages PostHog may run on. Every other page — admin, client portal,
 * affiliate portal and onboarding, reseller pages, demo practice screens, the
 * not-found page and anything added later — is private by default.
 *
 * Owner decision: public pages only, so no patient data reaches PostHog and no
 * BAA is needed. Never add a page that shows data behind a login.
 *
 * Patterns use the router's syntax: `:name` matches one path segment.
 */
export const POSTHOG_PUBLIC_PAGES = [
  // Marketing
  '/',
  '/how-it-works',
  '/healthcare',
  '/healthcare/book-a-call',
  '/healthcare/testimonial',
  '/healthcare/thank-you',
  '/healthcare/your-opportunity',
  '/strategy-call',
  '/strategy-call/schedule',
  '/strategy-call/providers-only',
  '/schedule-a-call',
  '/schedule-a-call/confirmation',
  '/walkthrough',
  '/training-demo',
  '/training-demo/video-2',
  // Demo entry form only. The demo practice screens live under /portal.
  '/demo',
  // Signup, terms, signing and payment links
  '/affiliates/apply',
  '/terms/:id',
  '/agreements/:token',
  '/billing',
  '/billing/:token',
  '/pay/:token',
  '/pay/:token/thank-you',
  // Login pages (owner chose to record these, passwords included)
  '/login',
  '/admin-login',
  '/affiliates/access',
] as const

const MATCHERS = POSTHOG_PUBLIC_PAGES.map((pattern) => new RegExp(
  `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]+/g, '[^/]+')}$`,
  // Matches the router, which ignores letter case.
  'i',
))

/** True only for a page on the allow-list. `path` is relative to the app base. */
export function isPublicPagePath(path: string): boolean {
  const clean = path.split(/[?#]/)[0] || '/'
  const trimmed = clean.length > 1 ? clean.replace(/\/$/, '') : clean
  return MATCHERS.some((matcher) => matcher.test(trimmed))
}

/**
 * Turns a browser pathname into a path relative to the app base. Returns null
 * when the pathname is outside the app, which callers treat as private.
 */
export function toAppPath(pathname: string, baseUrl: string): string | null {
  const base = baseUrl.replace(/\/$/, '')
  if (!base) return pathname || '/'
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null
  return pathname.slice(base.length) || '/'
}
