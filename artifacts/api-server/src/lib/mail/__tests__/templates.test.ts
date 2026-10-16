import { describe, expect, it } from 'vitest'
import { listTemplates, renderTemplate, TEMPLATES } from '@/lib/mail/templates'
import { BRAND, toPlainText } from '@/lib/mail/layout'

describe('transactional templates', () => {
  it('every template renders its sample with branding, a subject and no leftover placeholders', () => {
    for (const t of listTemplates()) {
      const r = t.render(t.sample as never)
      expect(r.subject.length).toBeGreaterThan(5)
      expect(r.html).toContain('patient-pipeline-logo.png')
      expect(r.html).toContain('Patient Pipeline')
      expect(r.html).toContain('Patient reactivation &amp; new-lead follow-up for your practice')
      expect(r.subject).not.toContain('Reactivation Power')
      expect(r.html).not.toContain('Reactivation Power')
      expect(r.html).not.toMatch(/\{\{|undefined|\[object/)
      expect(r.html).not.toContain('unsubscribe')
      expect(toPlainText(r.html).length).toBeGreaterThan(80)
    }
  })

  it('account active email confirms payment and gives the login setup steps', () => {
    const base = {
      firstName: 'Shannon', businessName: 'Example Wellness', email: 'owner@example.invalid',
      paidAt: '2026-10-16T21:53:48.000Z', cardBrand: 'visa', cardLast4: '4242',
      setupUrl: 'https://patientpipeline.app/login?email=owner%40example.invalid&start=setup',
    }
    const once = renderTemplate('account_active', { ...base, plan: 'one_time', amountCents: 250000 })
    expect(once.subject).toBe("You're all set — your Patient Pipeline account is active")
    expect(once.html).toContain('Thank you, Shannon! Your account is active.')
    expect(once.html).toContain('$2,500.00')
    expect(once.html).toContain('Visa ending 4242')
    expect(once.html).toContain('owner@example.invalid')
    expect(once.html).toContain('Set up my account')
    expect(once.html).toContain('start=setup')
    expect(once.html).not.toContain('/ month')
    const monthly = renderTemplate('account_active', { ...base, plan: 'subscription', amountCents: 0, monthlyCents: 49700 })
    expect(monthly.html).toContain('Waived')
    expect(monthly.html).toContain('$497.00 / month')
  })

  it('uses Patient Pipeline for website and logo links', () => {
    expect(BRAND.name).toBe('Patient Pipeline')
    expect(BRAND.siteUrl).toBe('https://patientpipeline.app')
    expect(BRAND.logoUrl).toBe('https://patientpipeline.app/images/patient-pipeline-logo.png')
  })

  it('preserves saved agreement titles in signature and signed-copy emails', () => {
    const agreementTitle = 'Reactivation Power 12-Month Service Agreement'
    for (const resend of [false, true]) {
      const r = renderTemplate('agreement_sent', {
        ...TEMPLATES.agreement_sent.sample,
        agreementTitle,
        resend,
      })
      expect(r.subject).toContain(agreementTitle)
      expect(r.html).toContain(`<strong>${agreementTitle}</strong>`)
      expect(r.html).toContain('The Patient Pipeline Team')
    }
    for (const adminCopy of [false, true]) {
      const r = renderTemplate('agreement_signed', {
        ...TEMPLATES.agreement_signed.sample,
        agreementTitle,
        adminCopy,
      })
      expect(r.subject).toContain(agreementTitle)
      expect(r.html).toContain(`<strong>${agreementTitle}</strong>`)
      expect(r.html).toContain('The Patient Pipeline Team')
    }
  })

  it('preserves supplied billing descriptions rather than renaming historical charges', () => {
    const description = 'Reactivation Power Access'
    const r = renderTemplate('payment_received', {
      ...TEMPLATES.payment_received.sample,
      description,
    })
    expect(r.subject).toContain('Patient Pipeline')
    expect(r.html).toContain(`<strong>${description}</strong>`)
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
    expect(r.html).toContain('https://patientpipeline.app/login?email=a%40b.co')
  })

  it('dunning emails name the cards and point at the billing page', () => {
    const backup = renderTemplate('payment_failed_backup_used', {
      name: 'Dr. Chen',
      amountCents: 47500,
      description: 'Monthly access',
      reason: 'Your card was declined.',
      declinedCard: { brand: 'visa', last4: '0341' },
      chargedCard: { brand: 'mastercard', last4: '4444' },
      updatePaymentUrl: 'https://x/billing?email=a%40b.co',
    })
    expect(backup.subject).toContain('backup card')
    expect(backup.html).toContain('Visa ending in 0341')
    expect(backup.html).toContain('Mastercard ending in 4444')
    expect(backup.html).toContain('access is not affected')
    expect(backup.html).toContain('https://patientpipeline.app/billing?email=a%40b.co')

    const both = renderTemplate('access_paused', {
      name: 'Dr. Chen',
      amountCents: 47500,
      description: 'Monthly access',
      reason: null,
      cardsTried: [{ brand: 'visa', last4: '0341' }, { brand: 'mastercard', last4: '4444' }],
      hadBackupCard: true,
      updatePaymentUrl: 'https://x/billing',
    })
    expect(both.subject).toContain('paused')
    expect(both.html).toContain('backup card (Mastercard ending in 4444)')
    const single = renderTemplate('access_paused', {
      name: 'Dr. Chen',
      amountCents: 47500,
      description: 'Monthly access',
      cardsTried: [{ brand: 'visa', last4: '0341' }],
      hadBackupCard: false,
      updatePaymentUrl: 'https://x/billing',
    })
    expect(single.html).toContain('no backup card')

    const restored = renderTemplate('access_restored', {
      name: 'Dr. Chen',
      amountCents: 47500,
      description: 'Monthly access',
      paidAt: '2026-10-02T12:00:00Z',
      chargedCard: { brand: 'visa', last4: '4242' },
      portalUrl: 'https://x/portal',
      billingUrl: 'https://x/billing',
    })
    expect(restored.subject).toContain('restored')
    expect(restored.html).toContain('October 2, 2026')
    expect(restored.html).toContain('https://patientpipeline.app/portal')
  })

  it('payment failed changes tone when access is suspended', () => {
    const base = { name: 'Dr. Chen', amountCents: 49700, description: 'Monthly', updatePaymentUrl: 'https://x/billing' }
    expect(renderTemplate('payment_failed', { ...base, accessSuspended: true }).subject).toContain('paused')
    const retry = renderTemplate('payment_failed', { ...base, accessSuspended: false, nextRetryAt: '2026-10-01T12:00:00Z' })
    expect(retry.subject).toContain('payment failed')
    expect(retry.html).toContain('October 1, 2026')
  })
})

describe('greetingName', () => {
  it('skips honorifics and falls back gracefully', async () => {
    const { greetingName } = await import('@/lib/mail/templates')
    expect(greetingName('Dr. Michael Chen')).toBe('Michael')
    expect(greetingName('Sarah Lee')).toBe('Sarah')
    expect(greetingName('Dr.')).toBe('there')
    expect(greetingName(null)).toBe('there')
  })
})
