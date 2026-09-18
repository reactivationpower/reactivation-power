import { describe, expect, it } from 'vitest'
import { listTemplates, renderTemplate } from '@/lib/mail/templates'
import { toPlainText } from '@/lib/mail/layout'

describe('transactional templates', () => {
  it('every template renders its sample with branding, a subject and no leftover placeholders', () => {
    for (const t of listTemplates()) {
      const r = t.render(t.sample as never)
      expect(r.subject.length).toBeGreaterThan(5)
      expect(r.html).toContain('logo-slogan.png')
      expect(r.html).not.toMatch(/\{\{|undefined|\[object/)
      expect(r.html).not.toContain('unsubscribe')
      expect(toPlainText(r.html).length).toBeGreaterThan(80)
    }
  })

  it('escapes user-supplied values', () => {
    const r = renderTemplate('portal_welcome', {
      firstName: '<script>x</script>',
      email: 'a@b.co',
      loginUrl: 'https://app.test/login?email=a%40b.co',
      role: 'owner',
    })
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;script&gt;')
    expect(r.html).toContain('https://app.test/login?email=a%40b.co')
  })

  it('payment failed changes tone when access is suspended', () => {
    const base = { name: 'Dr. Chen', amountCents: 49700, description: 'Monthly', updatePaymentUrl: 'https://x/billing' }
    expect(renderTemplate('payment_failed', { ...base, accessSuspended: true }).subject).toContain('paused')
    const retry = renderTemplate('payment_failed', { ...base, accessSuspended: false, nextRetryAt: '2026-10-01T12:00:00Z' })
    expect(retry.subject).toContain('payment failed')
    expect(retry.html).toContain('October 1, 2026')
  })
})
