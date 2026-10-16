import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rows: [] as Record<string, unknown>[],
}))
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/mail/send', () => ({ fromAddress: () => 'team@patientpipeline.app', sendEmail: vi.fn() }))
vi.mock('@workspace/db', () => ({
  emailLogTable: {},
  db: { select: (fields?: unknown) => ({
    from: () => ({
      where: () => fields ? Promise.resolve([{ count: mocks.rows.length }]) : {
        orderBy: () => ({ limit: async () => mocks.rows }),
      },
    }),
  }) },
}))
vi.mock('drizzle-orm', () => ({ desc: vi.fn(), eq: vi.fn(), sql: vi.fn() }))

import { listEmailLog, listTransactionalTemplates, sendTestEmail } from '../mail'

describe('administrator authentication-email diagnostics', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    mocks.requireAdmin.mockReset()
    mocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
    mocks.rows = [{
      id: 'log-1', type: 'portal_login_code', recipient: 'registered@example.test',
      subject: 'Your Patient Pipeline sign-in code', status: 'bounced',
      error: 'Provider reflected code=092814 password=private-password token=private-token',
      createdAt: new Date('2026-10-01T10:00:00Z'), deliveredAt: null, openedAt: null, clickedAt: null,
      lastClickedUrl: 'https://example.test/login?setup=private-token', lastEvent: 'email.bounced',
      lastEventAt: new Date('2026-10-01T10:01:00Z'), metadata: { code: '092814', test: true },
    }]
  })
  it('surfaces the failed code and registered address but no secrets or legacy links', async () => {
    const result = await listEmailLog()
    expect(mocks.requireAdmin).toHaveBeenCalledWith('super_admin')
    expect(result.rows[0]).toMatchObject({
      type: 'portal_login_code', status: 'bounced', recipient: 'registered@example.test',
      error: 'The recipient mailbox rejected this email.', lastClickedUrl: null, test: true,
    })
    expect(JSON.stringify(result)).not.toMatch(/092814|private-password|private-token/)
    expect(result.rows[0]).not.toHaveProperty('metadata')
  })
  it('requires a super administrator to view diagnostics and tracking configuration', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Not authorized'))
    await expect(listEmailLog()).rejects.toThrow('Not authorized')
    await expect(listTransactionalTemplates()).rejects.toThrow('Not authorized')
    await expect(sendTestEmail(new FormData())).rejects.toThrow('Not authorized')
  })
  it('reports missing tracking configuration without exposing the signing secret', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '   ')
    expect((await listTransactionalTemplates()).deliveryTrackingConfigured).toBe(false)
    vi.stubEnv('RESEND_WEBHOOK_SECRET', 'test-only-signing-secret')
    const result = await listTransactionalTemplates()
    expect(result.deliveryTrackingConfigured).toBe(true)
    expect(JSON.stringify(result)).not.toContain('test-only-signing-secret')
    vi.unstubAllEnvs()
  })
})
