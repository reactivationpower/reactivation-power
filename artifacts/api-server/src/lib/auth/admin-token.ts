import { createHmac, timingSafeEqual } from 'crypto'

export const ADMIN_COOKIE_NAME = 'tp_admin'
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export type AdminRole = 'super_admin' | 'sales_rep' | 'reseller_manager' | 'reseller_salesperson'
export const ADMIN_ROLES: readonly AdminRole[] = ['super_admin', 'sales_rep', 'reseller_manager', 'reseller_salesperson']

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value)
}

/**
 * Identity carried by the signed admin cookie. `userId` is the Supabase Auth
 * user id, so server actions can stamp records with the acting admin.
 */
export interface AdminPayload {
  v: 2
  sessionId: string
  userId: string
  email: string
  name: string | null
  role: AdminRole
  issuedAt: number
}

export type AdminIdentity = Pick<AdminPayload, 'userId' | 'email' | 'name' | 'role'> & {
  canManageServices?: boolean
}

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set')
  return s
}

function sign(data: string): string {
  return createHmac('sha256', `admin:${secret()}`)
    .update(data)
    .digest('base64url')
}

export function encodeAdminSession(identity: AdminIdentity, sessionId = ''): string {
  const payload: AdminPayload = { v: 2, ...identity, sessionId, issuedAt: Date.now() }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

/**
 * Verify the cookie signature and shape. Legacy (shared-password) cookies
 * have no user id and are rejected, which signs everyone out once.
 */
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
    ) as Partial<AdminPayload>
    if (payload.v !== 2) return null
    if (typeof payload.sessionId !== 'string' || !payload.sessionId) return null
    if (typeof payload.userId !== 'string' || !payload.userId) return null
    if (typeof payload.email !== 'string') return null
    if (!isAdminRole(payload.role)) return null
    if (!Number.isFinite(payload.issuedAt) || payload.issuedAt! > Date.now()) return null
    if (Date.now() - payload.issuedAt! >= ADMIN_SESSION_MAX_AGE * 1000)
      return null
    return {
      v: 2,
      sessionId: payload.sessionId,
      userId: payload.userId,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      role: payload.role,
      issuedAt: payload.issuedAt!,
    }
  } catch {
    return null
  }
}
