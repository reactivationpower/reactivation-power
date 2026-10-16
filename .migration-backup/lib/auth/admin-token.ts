import { createHmac, timingSafeEqual } from 'crypto'

export const ADMIN_COOKIE_NAME = 'tp_admin'
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

interface AdminPayload {
  role: 'admin'
  issuedAt: number
}

function secret(): string {
  return process.env.SUPABASE_JWT_SECRET || 'dev-secret'
}

function sign(data: string): string {
  return createHmac('sha256', `admin:${secret()}`)
    .update(data)
    .digest('base64url')
}

export function encodeAdminSession(): string {
  const payload: AdminPayload = { role: 'admin', issuedAt: Date.now() }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function decodeAdminSession(token: string): AdminPayload | null {
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
    ) as AdminPayload
    if (payload.role !== 'admin') return null
    if (Date.now() - payload.issuedAt > ADMIN_SESSION_MAX_AGE * 1000)
      return null
    return payload
  } catch {
    return null
  }
}
