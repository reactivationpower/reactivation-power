import { describe, expect, it } from 'vitest'
import { hashPortalPassword, verifyPortalPassword } from '../portal-password'
import { renderTemplate, TEMPLATES } from '@/lib/mail/templates'

describe('portal password hashing and sign-in emails', () => {
  it('uses independently salted, memory-hard password hashes', async () => {
    const password = 'a long disposable test password'
    const a = await hashPortalPassword(password), b = await hashPortalPassword(password)
    expect(a).not.toBe(b)
    expect(a).not.toContain(password)
    expect(await verifyPortalPassword(password, a)).toBe(true)
    expect(await verifyPortalPassword('wrong', a)).toBe(false)
    expect(await verifyPortalPassword(password, null)).toBe(false)
  })
  it('states the five-minute / single-use rules and keeps codes out of subjects', () => {
    const email = renderTemplate('portal_login_code', { code: '092814' })
    expect(email.html).toContain('092814')
    expect(email.html).toContain('five minutes')
    expect(email.html).toContain('only be used once')
    expect(email.subject).not.toContain('092814')
  })
  it('replaces the old passwordless welcome instructions for both roles', () => {
    for (const role of ['owner', 'staff'] as const) {
      const email = renderTemplate('portal_welcome', { ...TEMPLATES.portal_welcome.sample, role })
      expect(email.html).toContain('Set up or reset password')
      expect(email.html).toContain('six-digit code')
      expect(email.html).toContain('shared office inbox')
      expect(email.html).not.toContain('no password to remember')
    }
  })
})
