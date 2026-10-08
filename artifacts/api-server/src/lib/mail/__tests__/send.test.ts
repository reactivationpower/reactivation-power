import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ proxy: vi.fn(), values: vi.fn() }))
vi.mock('@replit/connectors-sdk', () => ({
  ReplitConnectors: class {
    proxy(...args: unknown[]) { return mocks.proxy(...args) }
  },
}))
vi.mock('@workspace/db', () => ({
  db: { insert: () => ({ values: mocks.values }) },
  emailLogTable: {},
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { DEFAULT_FROM, fromAddress, sendEmail } from '@/lib/mail/send'
import { TEMPLATES } from '@/lib/mail/templates'

describe('Patient Pipeline outgoing sender and links', () => {
  beforeEach(() => {
    mocks.proxy.mockReset()
    mocks.values.mockReset()
    mocks.values.mockResolvedValue(undefined)
    mocks.proxy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'test-email' }) })
    vi.stubEnv('RESEND_FROM', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to the verified Patient Pipeline sender', () => {
    expect(DEFAULT_FROM).toBe('Patient Pipeline <team@patientpipeline.app>')
    expect(fromAddress()).toBe(DEFAULT_FROM)
    vi.stubEnv('RESEND_FROM', 'Patient Pipeline Billing <billing@patientpipeline.app>')
    expect(fromAddress()).toBe('Patient Pipeline Billing <billing@patientpipeline.app>')
  })

  it('sends both HTML and plain-text app links on the public domain', async () => {
    const result = await sendEmail('payment_received', 'delivered@resend.dev', {
      ...TEMPLATES.payment_received.sample,
      portalUrl: 'https://reactivationpower.com/portal?view=billing#cards',
    })
    expect(result.ok).toBe(true)
    const body = mocks.proxy.mock.calls[0]![2].body
    expect(body.from).toBe(DEFAULT_FROM)
    expect(body.html).toContain('https://patientpipeline.app/portal?view=billing#cards')
    expect(body.text).toContain('https://patientpipeline.app/portal?view=billing#cards')
    expect(body.html).toContain('https://pay.stripe.com/receipts/sample')
    expect(body.html).not.toContain('reactivationpower.com')
    expect(body.text).not.toContain('reactivationpower.com')
  })

  it('refuses a stale old-domain sender instead of falling back silently', async () => {
    vi.stubEnv('RESEND_FROM', 'Reactivation Power <team@reactivationpower.com>')
    const result = await sendEmail('portal_welcome', 'delivered@resend.dev', TEMPLATES.portal_welcome.sample)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('patientpipeline.app')
    expect(mocks.proxy).not.toHaveBeenCalled()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('returns a logged failure for unsafe links without throwing or sending', async () => {
    const result = await sendEmail('portal_welcome', 'delivered@resend.dev', {
      ...TEMPLATES.portal_welcome.sample,
      loginUrl: 'javascript:alert(1)',
    })
    expect(result.ok).toBe(false)
    expect(mocks.proxy).not.toHaveBeenCalled()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('logs failed sign-in delivery without storing the code, password or reset link', async () => {
    mocks.proxy.mockResolvedValue({ ok: false, status: 403, json: async () => ({
      message: 'Rejected code 092814 password=private-password https://x.test/reset?token=private-token',
    }) })
    const result = await sendEmail('portal_login_code', 'registered@example.test', { code: '092814' }, {
      metadata: { code: '092814', password: 'private-password', setupUrl: 'https://x.test/reset?token=private-token', test: true },
    })
    expect(result.ok).toBe(false)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      type: 'portal_login_code', recipient: 'registered@example.test', status: 'failed',
      metadata: { test: true }, error: 'Resend rejected the authentication email (HTTP 403)',
    }))
    const diagnostic = JSON.stringify({ result, logs: mocks.values.mock.calls })
    for (const secret of ['092814', 'private-password', 'private-token']) expect(diagnostic).not.toContain(secret)
    expect(mocks.proxy.mock.calls[0]![2].body.html).toContain('092814')
  })

  it('does not leak thrown provider errors into authentication diagnostics', async () => {
    mocks.proxy.mockRejectedValue(new Error('request contained code 092814 reset-token'))
    const result = await sendEmail('portal_password_setup', 'registered@example.test', TEMPLATES.portal_password_setup.sample)
    expect(result.ok).toBe(false)
    expect(JSON.stringify({ result, logs: mocks.values.mock.calls })).not.toMatch(/092814|reset-token|sample-token/)
  })

  it('records provider acceptance separately from inbox delivery', async () => {
    const result = await sendEmail('portal_login_code', 'registered@example.test', { code: '092814' })
    expect(result).toMatchObject({ ok: true, providerId: 'test-email' })
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', providerId: 'test-email', metadata: null }))
    expect(JSON.stringify(mocks.values.mock.calls)).not.toContain('092814')
  })
})