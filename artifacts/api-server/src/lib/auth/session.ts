
import { cookies, headers } from 'next/headers'
import type { Request } from 'express'
import { pool } from '@workspace/db'
import { createIdleSession, readIdleSession, revokeIdleSession } from './idle-session'
import { isDemoSessionParticipant, readDemoSession } from './demo-session'
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

export async function setSessionCookie(payload: SessionPayload, preserveDeadline = false) {
  const old = decodeSession((await cookies()).get(SESSION_COOKIE_NAME)?.value ?? '')
  if (preserveDeadline && !old) throw new Error('Session expired')
  await createIdleSession(payload.sessionId, 'portal', payload.participantId,
    payload.issuedAt + SESSION_MAX_AGE * 1000,
    preserveDeadline && !await isDemoSessionParticipant(payload.participantId) ? old?.sessionId : undefined)
  // Replacing a browser's session retires its previous cookie, not other devices.
  if (old) await revokeIdleSession(old.sessionId, 'portal')
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
  const old = decodeSession(store.get(SESSION_COOKIE_NAME)?.value ?? '')
  if (old) await revokeIdleSession(old.sessionId, 'portal')
  store.delete(SESSION_COOKIE_NAME)
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const session = await validatePortalToken(token)
  if (!session) store.delete(SESSION_COOKIE_NAME)
  return session
}

export async function validatePortalToken(token: string): Promise<SessionPayload | null> {
  const payload = decodeSession(token)
  if (!payload) return null
  if (!await portalCredentialIsCurrent(payload)) return null
  if (!payload.credentialVersion && await readDemoSession(payload)) return payload
  return await readIdleSession(payload.sessionId, 'portal', payload.participantId) ? payload : null
}

export async function portalCredentialIsCurrent(payload: SessionPayload): Promise<boolean> {
  // Retire pre-MFA logins. Only the intentionally separate demo and privileged
  // impersonation flows can issue portal cookies without a password revision.
  if (!payload.credentialVersion) {
    if (payload.impersonatedBy) return true
    const demo = await pool.query('SELECT 1 FROM participants WHERE id = $1 AND is_demo = true AND is_active = true',
      [payload.participantId])
    return demo.rowCount === 1
  }
  const result = await pool.query(`SELECT 1 FROM portal_auth_credentials c
    JOIN participants p ON p.id = c.participant_id
    WHERE c.participant_id = $1 AND c.version = $2 AND c.email = lower(p.email) AND p.is_active = true`,
  [payload.participantId, payload.credentialVersion])
  return result.rowCount === 1
}

export async function getSessionFromRequest(req: Request) {
  return validatePortalToken(req.cookies?.[SESSION_COOKIE_NAME] ?? '')
}

/** Best-effort client IP from request headers */
export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')
}
