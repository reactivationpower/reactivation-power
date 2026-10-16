import 'server-only'

import { cookies, headers } from 'next/headers'
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
  const h = await headers()
  const proto = h.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  return process.env.NODE_ENV === 'production'
}

export async function setSessionCookie(payload: SessionPayload) {
  const store = await cookies()
  const secure = await isSecureRequest()
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

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return decodeSession(token)
}

/** Best-effort client IP from request headers */
export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')
}
