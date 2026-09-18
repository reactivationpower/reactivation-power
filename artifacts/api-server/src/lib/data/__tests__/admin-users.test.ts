import { beforeEach, describe, expect, it, vi } from 'vitest'

/** In-memory stand-in for the Supabase Auth admin API. */
const users: any[] = []
const auth = {
  admin: {
    listUsers: vi.fn(async () => ({ data: { users: [...users] }, error: null })),
    getUserById: vi.fn(async (id: string) => {
      const user = users.find((u) => u.id === id) ?? null
      return { data: { user }, error: user ? null : { message: 'not found' } }
    }),
    updateUserById: vi.fn(async (id: string, attrs: any) => {
      const user = users.find((u) => u.id === id)
      if (!user) return { data: { user: null }, error: { message: 'not found' } }
      if (attrs.app_metadata) user.app_metadata = attrs.app_metadata
      if (attrs.password) user.has_password = true
      return { data: { user }, error: null }
    }),
    createUser: vi.fn(async (attrs: any) => {
      const user = { id: `u${users.length + 1}`, created_at: 'now', ...attrs }
      users.push(user)
      return { data: { user }, error: null }
    }),
    generateLink: vi.fn<(opts: any) => Promise<any>>(),
  },
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ auth }) }))
const sendEmail = vi.fn<(...args: any[]) => Promise<any>>()
vi.mock('@/lib/mail/send', () => ({ sendEmail: (...args: any[]) => sendEmail(...args) }))

function generateLinkCreatesUser() {
  auth.admin.generateLink.mockImplementation(async (opts: any) => {
    if (opts.type === 'invite') {
      const user = { id: `u${users.length + 1}`, email: opts.email, created_at: 'now', app_metadata: {} }
      users.push(user)
      return { data: { user, properties: {} }, error: null }
    }
    return { data: { properties: { hashed_token: 'SECRET-TOKEN' } }, error: null }
  })
}

const mod = await import('@/lib/data/admin-users')
const log = { info: vi.fn(), warn: vi.fn() }

function superAdmin(over: Record<string, unknown> = {}) {
  return {
    id: 'boot', email: 'boss@example.org', created_at: 'now', last_sign_in_at: '2026-01-01',
    app_metadata: { admin_role: 'super_admin', admin_active: true, default_commission_rate: 0 },
    ...over,
  }
}

describe('seedSuperAdmin is non-reviving', () => {
  beforeEach(() => {
    users.length = 0
    vi.clearAllMocks()
    process.env.SUPER_ADMIN_EMAIL = 'boss@example.org'
    delete process.env.SUPER_ADMIN_INITIAL_PASSWORD
  })

  it('creates the bootstrap super admin when none exists', async () => {
    process.env.SUPER_ADMIN_INITIAL_PASSWORD = 'initial-pass'
    expect(await mod.seedSuperAdmin(log)).toBe('created_with_password')
    expect(users[0].app_metadata.admin_role).toBe('super_admin')
  })

  it('does not un-deactivate a deactivated bootstrap account on restart', async () => {
    users.push(superAdmin({ app_metadata: { admin_role: 'super_admin', admin_active: false } }))
    expect(await mod.seedSuperAdmin(log)).toBe('skipped_super_admin_exists')
    expect(auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(users[0].app_metadata.admin_active).toBe(false)
  })

  it('does not re-promote a demoted bootstrap account while another super admin exists', async () => {
    users.push(superAdmin({ app_metadata: { admin_role: 'sales_rep', admin_active: true } }))
    users.push(superAdmin({ id: 'other', email: 'other@example.org' }))
    expect(await mod.seedSuperAdmin(log)).toBe('skipped_super_admin_exists')
    expect(users[0].app_metadata.admin_role).toBe('sales_rep')
  })

  it('only applies the initial password to a bootstrap account that never signed in', async () => {
    process.env.SUPER_ADMIN_INITIAL_PASSWORD = 'initial-pass'
    users.push(superAdmin({ last_sign_in_at: null }))
    expect(await mod.seedSuperAdmin(log)).toBe('set_initial_password')
    expect(users[0].has_password).toBe(true)

    vi.clearAllMocks()
    users[0].last_sign_in_at = '2026-02-02'
    expect(await mod.seedSuperAdmin(log)).toBe('skipped_super_admin_exists')
    expect(auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('never logs an invite link when the invite email fails', async () => {
    generateLinkCreatesUser()
    sendEmail.mockResolvedValueOnce({ ok: false, logId: 'l1', error: 'domain not verified' })
    expect(await mod.seedSuperAdmin(log)).toBe('created_email_failed')
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls])
    expect(logged).not.toContain('SECRET-TOKEN')
    expect(logged).not.toContain('token_hash')
  })
})

describe('live profile cache', () => {
  beforeEach(() => {
    users.length = 0
    vi.clearAllMocks()
  })

  it('re-reads Supabase after a mutation invalidates the cache', async () => {
    users.push(superAdmin())
    expect((await mod.getLiveAdminProfile('boot'))?.role).toBe('super_admin')
    expect((await mod.getLiveAdminProfile('boot'))?.role).toBe('super_admin')
    expect(auth.admin.getUserById).toHaveBeenCalledTimes(1)

    await mod.updateAdminUser('boot', { role: 'sales_rep' })
    expect((await mod.getLiveAdminProfile('boot'))?.role).toBe('sales_rep')

    await mod.setAdminUserActive('boot', false)
    expect((await mod.getLiveAdminProfile('boot'))?.active).toBe(false)
  })
})

describe('inviteAdminUser', () => {
  beforeEach(() => {
    users.length = 0
    vi.clearAllMocks()
    generateLinkCreatesUser()
  })

  it('sends the branded invite through our mailer and withholds the manual link', async () => {
    sendEmail.mockResolvedValueOnce({ ok: true, logId: 'l1', providerId: 're_1' })
    const result = await mod.inviteAdminUser({
      email: 'Rep@Example.org', name: 'Jordan Lee', role: 'sales_rep',
      defaultCommissionRate: 10, invitedBy: 'boot', invitedByName: 'Boss',
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [type, to, data] = sendEmail.mock.calls[0]
    expect(type).toBe('admin_invite')
    expect(to).toBe('rep@example.org')
    expect(data.inviteUrl).toContain('token_hash=SECRET-TOKEN')
    expect(data.invitedByName).toBe('Boss')
    expect(result.emailSent).toBe(true)
    expect(result.inviteLink).toBeNull()
    expect(result.user.role).toBe('sales_rep')
  })

  it('returns the one-time link for manual sharing when sending fails', async () => {
    sendEmail.mockResolvedValueOnce({ ok: false, logId: 'l1', error: 'Resend responded 403' })
    const result = await mod.inviteAdminUser({
      email: 'rep@example.org', name: null, role: 'sales_rep', defaultCommissionRate: 0, invitedBy: 'boot',
    })
    expect(result.emailSent).toBe(false)
    expect(result.inviteLink).toContain('/admin-login?token_hash=SECRET-TOKEN')
    expect(result.emailError).toBe('Resend responded 403')
  })
})
