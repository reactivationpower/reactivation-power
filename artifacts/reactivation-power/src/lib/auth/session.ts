// @ts-nocheck


// import { cookies, headers } from 'next/headers'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  decodeSession,
  encodeSession,
  type SessionPayload,
} from './token'

export type { SessionPayload }
export { SESSION_COOKIE_NAME }

/**
 * Detect whether the original request arrived over HTTPS.
 * The app may run behind a proxy (e.g. the v0 preview), so check
 * x-forwarded-proto rather than relying on NODE_ENV.
 */
async function isSecureRequest(): Promise<boolean> {
  const h = null as any; // mocked server data
  const proto = h.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return import.meta.env.MODE === 'production'
}

export function setSessionCookie() {
  const store = null as any; // mocked server data
  const secure = null as any; // mocked server data
  store.set(SESSION_COOKIE_NAME, encodeSession(payload), {
    httpOnly: true,
    // The preview runs in a cross-origin iframe: cookies must be
    // SameSite=None + Secure + Partitioned to survive navigation there.
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned: secure,
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

export function clearSessionCookie() {
  const store = null as any; // mocked server data
  store.delete(SESSION_COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = null as any; // mocked server data
  const token = store.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return decodeSession(token)
}

/** Best-effort client IP from request headers */
export async function getClientIp(): Promise<string | null> {
  const h = null as any; // mocked server data
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')
}
