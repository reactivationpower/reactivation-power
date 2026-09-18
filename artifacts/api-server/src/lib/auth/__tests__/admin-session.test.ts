import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

process.env.SESSION_SECRET = 'test-secret'

const getLiveAdminProfile = vi.fn()
vi.mock('@/lib/data/admin-users', () => ({ getLiveAdminProfile }))

const { encodeAdminSession, ADMIN_COOKIE_NAME } = await import('@/lib/auth/admin-token')
const { getAdminSessionFromRequest } = await import('@/lib/auth/admin-session')

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

  it('rejects tampered or missing cookies without touching Supabase', async () => {
    expect(await getAdminSessionFromRequest(req('garbage'))).toBeNull()
    expect(await getAdminSessionFromRequest({ cookies: {} } as unknown as Request)).toBeNull()
    expect(getLiveAdminProfile).not.toHaveBeenCalled()
  })
})
