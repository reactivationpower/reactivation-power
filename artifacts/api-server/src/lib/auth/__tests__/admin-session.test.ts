import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

process.env.SESSION_SECRET = 'test-secret'

const getLiveAdminProfile = vi.fn()
vi.mock('@/lib/data/admin-users', () => ({ getLiveAdminProfile }))

const { encodeAdminSession, ADMIN_COOKIE_NAME } = await import('@/lib/auth/admin-token')
const { getAdminSessionFromRequest, satisfies } = await import('@/lib/auth/admin-session')

const identity = { userId: 'u1', email: 'a@b.co', name: 'A', role: 'super_admin' as const }
const req = (cookie = encodeAdminSession(identity)) =>
  ({ cookies: { [ADMIN_COOKIE_NAME]: cookie } }) as unknown as Request
const profile = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'u1', email: 'a@b.co', name: 'A', role: 'super_admin', active: true, ...over,
})

describe('admin session authorization uses the live profile, not the cookie claim', () => {
  beforeEach(() => getLiveAdminProfile.mockReset())

  it('accepts an active admin whose cookie matches the live profile', async () => {
    getLiveAdminProfile.mockResolvedValue(profile())
    const s = await getAdminSessionFromRequest(req())
    expect(s?.role).toBe('super_admin')
    expect(s?.userId).toBe('u1')
  })

  it('downgrades a super_admin cookie immediately after demotion', async () => {
    getLiveAdminProfile.mockResolvedValue(profile({ role: 'sales_rep' }))
    const s = await getAdminSessionFromRequest(req())
    expect(s?.role).toBe('sales_rep')
  })

  it('rejects the cookie once the user is deactivated', async () => {
    getLiveAdminProfile.mockResolvedValue(profile({ active: false }))
    expect(await getAdminSessionFromRequest(req())).toBeNull()
  })

  it('rejects the cookie once the user is no longer an admin at all', async () => {
    getLiveAdminProfile.mockResolvedValue(null)
    expect(await getAdminSessionFromRequest(req())).toBeNull()
  })

  it('uses live service access without granting super-admin access', async () => {
    getLiveAdminProfile.mockResolvedValue(profile({ role: 'sales_rep', canManageServices: true }))
    const s = await getAdminSessionFromRequest(req())
    expect(s?.canManageServices).toBe(true)
    expect(satisfies(s!.role, 'manage_services', s!.canManageServices)).toBe(true)
    expect(satisfies(s!.role, 'super_admin', s!.canManageServices)).toBe(false)
  })

  it('does not retain a revoked capability from a signed cookie', async () => {
    getLiveAdminProfile.mockResolvedValue(profile({ role: 'sales_rep', canManageServices: false }))
    const s = await getAdminSessionFromRequest(req(encodeAdminSession({ ...identity, canManageServices: true })))
    expect(s?.canManageServices).toBe(false)
    expect(satisfies(s!.role, 'manage_services', s!.canManageServices)).toBe(false)
  })

  it('rejects tampered or missing cookies without touching Supabase', async () => {
    expect(await getAdminSessionFromRequest(req('garbage'))).toBeNull()
    expect(await getAdminSessionFromRequest({ cookies: {} } as unknown as Request)).toBeNull()
    expect(getLiveAdminProfile).not.toHaveBeenCalled()
  })
})

describe('service-management permission boundaries', () => {
  it('keeps ungranted sales reps restricted and existing super admins unchanged', () => {
    expect(satisfies('sales_rep', 'admin')).toBe(true)
    expect(satisfies('sales_rep', 'manage_services')).toBe(false)
    expect(satisfies('sales_rep', 'super_admin', true)).toBe(false)
    expect(satisfies('super_admin', 'manage_services')).toBe(true)
    expect(satisfies('super_admin', 'super_admin')).toBe(true)
  })
})
