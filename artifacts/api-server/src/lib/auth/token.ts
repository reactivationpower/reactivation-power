import { createHmac, timingSafeEqual } from 'crypto'

export const SESSION_COOKIE_NAME = 'tp_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  participantId: string
  sessionId: string
  issuedAt: number
  /** Real owner/staff logins are bound to the verified password revision. */
  credentialVersion?: string
  /** Set when a super admin opened this portal account via "View as client". */
  impersonatedBy?: { userId: string; email: string }
}

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set')
  return s
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export function encodeSession(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function decodeSession(token: string): SessionPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null
  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(data)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString(),
    ) as SessionPayload
    if (!payload.participantId || !payload.sessionId) return null
    if (!Number.isFinite(payload.issuedAt) || payload.issuedAt > Date.now()) return null
    if (Date.now() - payload.issuedAt >= SESSION_MAX_AGE * 1000) return null
    return payload
  } catch {
    return null
  }
}
