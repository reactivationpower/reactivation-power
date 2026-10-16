/**
 * Client for the Express API (artifacts/api-server), mounted at /api.
 * The API is path-routed under the same origin as this SPA.
 */
const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export class NotFoundError extends ApiError {
  constructor() {
    super('Not found', 404)
  }
}

/**
 * Only follow same-origin, path-only redirects from the API. Anything else
 * (protocol-relative "//host", backslash tricks, absolute URLs) goes home.
 */
export function safeRedirect(target: string): string {
  if (/^\/(?![\/\\])/.test(target)) {
    try {
      const url = new URL(target, window.location.origin)
      if (url.origin === window.location.origin) return url.pathname + url.search + url.hash
    } catch {
      // fall through
    }
  }
  return '/'
}

function encodeArg(arg: unknown): unknown {
  if (typeof FormData !== 'undefined' && arg instanceof FormData) {
    const entries: [string, string][] = []
    arg.forEach((value, key) => {
      if (typeof value === 'string') entries.push([key, value])
      else throw new Error(`File field "${key}" cannot be sent through an action; upload it first.`)
    })
    return { __formData: entries }
  }
  return arg
}

/**
 * Invoke a former Next.js server action by module + function name.
 * If the action redirected, the browser follows the redirect (full navigation,
 * because the redirect may depend on freshly set cookies).
 */
export interface ActionOptions<T> {
  /**
   * Value to settle with when the visitor comes back (browser Back) to this
   * page after the action redirected away. Defaults to the previous state for
   * (prevState, formData) form actions, otherwise undefined.
   */
  restored?: (args: unknown[]) => T
}

export async function callAction<T = unknown>(
  module: string,
  fn: string,
  args: unknown[],
  options: ActionOptions<T> = {},
): Promise<T> {
  const res = await fetch(apiUrl(`/actions/${module}/${fn}`), {
    method: 'POST',
    ...((module === 'affiliate-onboarding' || module === 'reseller-onboarding') ? { cache: 'no-store' as const } : {}),
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args: args.map(encodeArg) }),
  })
  const body = (await res.json().catch(() => null)) as
    | { ok: true; result: T; redirect?: string }
    | { ok: false; error: string }
    | null
  if (!body) throw new ApiError(`Request failed (${res.status})`, res.status)
  if (!body.ok) throw new ApiError(body.error || 'Request failed', res.status)
  if (body.redirect) {
    // Keep pending UI stable while the browser navigates.
    const restored = untilRestoredFromBackForwardCache()
    window.location.assign(safeRedirect(body.redirect))
    await restored
    // The visitor pressed Back and the browser brought this page back from its
    // back/forward cache. Settle so pending UI ("Submitting…") clears and the
    // form can be sent again. By default a form-state action ((prevState,
    // formData), as used by useActionState) gets its previous state back;
    // anything else resolves empty.
    if (options.restored) return options.restored(args)
    return (args.length === 2 && isFormData(args[1]) ? args[0] : undefined) as T
  }
  return body.result
}

function isFormData(value: unknown): boolean {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

/** Resolves only when this page is shown again from the back/forward cache. */
function untilRestoredFromBackForwardCache(): Promise<void> {
  return new Promise<void>((resolve) => {
    const onPageShow = (event: Event) => {
      if (!(event as PageTransitionEvent).persisted) return
      window.removeEventListener('pageshow', onPageShow)
      resolve()
    }
    window.addEventListener('pageshow', onPageShow)
  })
}

/**
 * Run `onRestore` whenever this page comes back from the back/forward cache
 * (for example after a redirecting submit and the browser Back button).
 * Returns a cleanup function.
 */
export function onBackForwardRestore(onRestore: () => void): () => void {
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) onRestore()
  }
  window.addEventListener('pageshow', onPageShow)
  return () => window.removeEventListener('pageshow', onPageShow)
}

export function action<T = unknown>(module: string, fn: string, options?: ActionOptions<T>) {
  return (...args: unknown[]): Promise<T> => callAction<T>(module, fn, args, options)
}

export type PageResult<T> = { data: T } | { redirect: string }

/**
 * Fetch a page loader (GET /api/pages/...). Handles redirects (login guards)
 * by navigating, and throws NotFoundError on 404.
 */
export async function loadPage<T>(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const params = new URLSearchParams(
    Object.entries(query ?? {}).filter((e): e is [string, string] => e[1] != null),
  )
  // Tell the loader which SPA page we are on so auth redirects return here.
  params.set('_path', window.location.pathname + window.location.search)
  const qs = '?' + params.toString()
  const res = await fetch(apiUrl(`/pages${path}${qs}`), {
    credentials: 'include',
    cache: 'no-store',
  })
  if (res.status === 404) throw new NotFoundError()
  const body = (await res.json().catch(() => null)) as
    | { data: T }
    | { redirect: string }
    | { error?: string }
    | null
  if (!res.ok || !body) {
    throw new ApiError(
      (body && 'error' in body && body.error) || `Failed to load page (${res.status})`,
      res.status,
    )
  }
  if ('redirect' in body) {
    window.location.assign(safeRedirect(body.redirect))
    return new Promise<T>(() => {})
  }
  return (body as { data: T }).data
}
