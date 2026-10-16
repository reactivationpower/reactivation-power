import { describe, expect, it } from 'vitest'
import { EMAIL_AUDIENCES, EMAIL_TEMPLATES, isEmailAudienceId, templatesForAudience } from '@workspace/shared/email-templates'

describe('Patient Pipeline launch marketing', () => {
  it('preserves all 68 slots, ordering, unique subjects and stable IDs', () => {
    expect(EMAIL_TEMPLATES).toHaveLength(68)
    expect(new Set(EMAIL_TEMPLATES.map(t => t.id)).size).toBe(68)
    expect(new Set(EMAIL_TEMPLATES.map(t => t.subject.toLowerCase())).size).toBe(68)
    const numbering = [
      ...Array.from({ length: 14 }, (_, day) => [1, 2, 3].map(slot => `${day + 1}.${slot}`)).flat(),
      ...Array.from({ length: 26 }, (_, i) => String(i + 15)),
    ]
    expect(EMAIL_TEMPLATES.map(t => t.name.match(/^Email (\d+(?:\.\d+)?) — /)?.[1])).toEqual(numbering)
  })

  it('gives each product substantial dedicated coverage alongside combined messages', () => {
    for (const focus of ['reactivation', 'lead-follow-up', 'combined']) {
      expect(EMAIL_TEMPLATES.filter(t => t.focus === focus).length).toBeGreaterThanOrEqual(20)
    }
    expect(EMAIL_AUDIENCES).toHaveLength(1)
    expect(templatesForAudience('chiropractic')).toHaveLength(68)
    expect(isEmailAudienceId('chiropractic')).toBe(true)
    expect(isEmailAudienceId('unknown')).toBe(false)
  })

  it.each(EMAIL_TEMPLATES.map(t => [t.name, t] as const))('%s carries correct branding, offer, images and working merge tags', (_name, template) => {
    const doc = new DOMParser().parseFromString(template.html, 'text/html')
    const text = doc.body.textContent ?? ''
    expect(`${template.subject} ${template.previewText} ${template.angle} ${text}`).not.toMatch(/Reactivation Power|Pipeline Power/i)
    expect(text).toContain('Reactivation')
    expect(text).toContain('Lead Follow-Up')
    expect(text).toContain('Together at one launch price.')
    expect(text).toContain('The Patient Pipeline Team')
    expect(text).toContain('{{contact.first_name}}')
    expect(doc.querySelector('a[href="{{unsubscribe_link}}"]')).not.toBeNull()
    const callLinks = doc.querySelectorAll('.btn a, a:has(img)')
    expect(callLinks).toHaveLength(2)
    for (const link of callLinks) {
      expect(link.getAttribute('href')).toBe('https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd')
    }
    expect(doc.querySelectorAll('a')).toHaveLength(3)
    expect(template.html).not.toContain('https://patientpipeline.app/schedule-a-call')
    expect(doc.querySelectorAll('a[href*="reactivationpower.com"]')).toHaveLength(0)
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://patientpipeline.app/images/patient-pipeline-logo.png')
    expect(doc.querySelectorAll('[src*="reactivationpower.com"]')).toHaveLength(0)
    expect(doc.querySelector('img')?.getAttribute('alt')).toBe('Patient Pipeline')
    expect(doc.querySelectorAll('img')).toHaveLength(1)
    expect(doc.querySelectorAll('script,iframe,form')).toHaveLength(0)
    expect(template.subject.length).toBeLessThanOrEqual(110)
    expect(template.previewText.length).toBeLessThanOrEqual(200)
    expect(new TextEncoder().encode(template.html).length).toBeLessThan(80_000)
    expect(text).not.toMatch(/\$\s*\d|only \d+ spots|guaranteed (?:patients|bookings|revenue)|not a bundle/i)
  })

  it('keeps body text readable without image loading and uses responsive email-safe markup', () => {
    for (const template of EMAIL_TEMPLATES) {
      expect(template.html).toContain('role="presentation"')
      expect(template.html).toContain('@media only screen and (max-width:620px)')
      expect(template.html).toContain('.offer-col{display:block!important')
      expect(template.html).not.toMatch(/display:\s*(?:flex|grid)|background-image:/)
    }
  })
})