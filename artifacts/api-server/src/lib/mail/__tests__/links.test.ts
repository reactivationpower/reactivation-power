import { describe, expect, it } from 'vitest'
import { canonicalEmailLinks } from '@/lib/mail/links'
import { listTemplates, renderTemplate } from '@/lib/mail/templates'
import { toPlainText } from '@/lib/mail/layout'

describe('outgoing email link domain', () => {
  it('rewrites every template app link, including saved old-domain outbox payloads', () => {
    for (const template of listTemplates()) {
      const data = Object.fromEntries(Object.entries(template.sample).map(([key, value]) =>
        [key, key.endsWith('Url') && key !== 'receiptUrl' && typeof value === 'string'
          ? value.replace('https://patientpipeline.app', 'https://www.reactivationpower.com') : value]))
      const rendered = renderTemplate(template.id, data as never)
      for (const url of rendered.html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)) {
        // Receipt links belong to Stripe, not to the app.
        expect(['patientpipeline.app', 'pay.stripe.com', ...(template.id === 'strategy_appointment' ? ['meet.google.com'] : [])]).toContain(new URL(url[1]!).hostname)
      }
      expect(rendered.html).not.toContain('reactivationpower.com')
      expect(toPlainText(rendered.html)).not.toContain('reactivationpower.com')
    }
  })

  it('preserves tokens, encoded query parameters, fragments and customer addresses exactly', () => {
    const path = '/admin-login?token_hash=a%2Fb%2Bc%3D&type=magiclink#password'
    const data = canonicalEmailLinks({
      inviteUrl: `http://reactivationpower.com${path}`,
      loginUrl: '/login?email=old%40reactivationpower.com',
      email: 'old@reactivationpower.com',
      description: 'Reactivation Power Access',
      receiptUrl: 'https://pay.stripe.com/receipts/sample',
    })
    expect(data.inviteUrl).toBe(`https://patientpipeline.app${path}`)
    expect(data.loginUrl).toBe('https://patientpipeline.app/login?email=old%40reactivationpower.com')
    expect(data.email).toBe('old@reactivationpower.com')
    expect(data.description).toBe('Reactivation Power Access')
    expect(data.receiptUrl).toBe('https://pay.stripe.com/receipts/sample')
  })

  it('never emits a development origin or stale configured origin in app links', () => {
    for (const origin of ['http://localhost:5173', 'https://workspace.replit.dev', 'https://reactivationpower.com']) {
      expect(canonicalEmailLinks({ portalUrl: `${origin}/portal` }).portalUrl)
        .toBe('https://patientpipeline.app/portal')
    }
  })

  it('rejects invalid app links rather than emitting unsafe URLs', () => {
    expect(() => canonicalEmailLinks({ signUrl: 'javascript:alert(1)' })).toThrow('Invalid email link')
  })
})