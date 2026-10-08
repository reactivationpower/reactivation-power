import type { Request } from 'express'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE_NAME, decodeAdminSession, type AdminPayload, type AdminRole } from './admin-token'
import { getLiveAdminProfile } from '@/lib/data/admin-users'
import { readIdleSession } from './idle-session'

export type AdminSession = AdminPayload & { canManageServices: boolean }

/** Required auth level for admin routes/actions. `admin` = any active admin. */
export type AdminRequirement = 'admin' | 'super_admin' | 'manage_services'

export function satisfies(role: AdminRole, requirement: AdminRequirement, canManageServices = false): boolean {
  return requirement === 'admin' || role === 'super_admin' ||
    (requirement === 'manage_services' && canManageServices === true)
}

async function validate(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null
  const payload = decodeAdminSession(token)
  if (!payload) return null
  if (!await readIdleSession(payload.sessionId, 'admin', payload.userId)) return null
  // The cookie only proves who signed in. Role and active flag come from the
  // live profile so demotion/deactivation take effect immediately.
  const live = await getLiveAdminProfile(payload.userId)
  if (!live || !live.active) return null
  return { ...payload, email: live.email, name: live.name, role: live.role, canManageServices: live.canManageServices === true }
}

/** Admin identity for an Express request (route handlers), or null. */
export async function getAdminSessionFromRequest(req: Request): Promise<AdminSession | null> {
  return validate(req.cookies?.[ADMIN_COOKIE_NAME] as string | undefined)
}

/** Admin identity inside a server action (via the next/headers shim), or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies()
  return validate(store.get(ADMIN_COOKIE_NAME)?.value)
}

/**
 * Assert the acting user is an active admin (optionally a super admin) and
 * return their identity so the action can record who did it.
 */
export async function requireAdmin(requirement: AdminRequirement = 'admin'): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session) throw new Error('Unauthorized')
  if (!satisfies(session.role, requirement, session.canManageServices)) throw new Error('Forbidden: required admin permission is missing')
  return session
}

/** Where a role lands after signing in / when a page is not allowed. */
export function adminHomeFor(role: AdminRole): string {
  return role === 'super_admin' ? '/admin' : '/admin/payments'
}
