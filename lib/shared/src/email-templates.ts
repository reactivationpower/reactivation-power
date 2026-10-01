import { earlyEmails } from './marketing-email-content/early'
import { middleEmails } from './marketing-email-content/middle'
import { lateEmails } from './marketing-email-content/late'
import type { MarketingEmailCopy } from './marketing-email-content/types'
import { renderMarketingEmail } from './marketing-email-renderer'

/** Prospect marketing, not patient outreach or automatic account notifications. */
export const EMAIL_AUDIENCES = [
  {
    id: 'chiropractic',
    name: 'Chiropractic',
    description:
      'For chiropractic practice owners and teams. Patient Pipeline brings Reactivation and Lead Follow-Up together at one launch price: past-patient conversations, new-inquiry follow-up, and a guided calling workflow for your staff.',
  },
] as const

export type EmailAudience = (typeof EMAIL_AUDIENCES)[number]
export type EmailAudienceId = EmailAudience['id']

export interface EmailTemplate {
  id: string
  audience: EmailAudienceId
  name: string
  subject: string
  previewText: string
  angle: string
  focus: MarketingEmailCopy['focus']
  html: string
}

export function isEmailAudienceId(value: string | null | undefined): value is EmailAudienceId {
  return EMAIL_AUDIENCES.some(audience => audience.id === value)
}

// Retain this export for preview compatibility and previously hosted graphics.
// Rewritten emails use readable HTML panels rather than old campaign graphics.
export const EMAIL_ASSET_BASE = 'https://www.reactivationpower.com/images/emails'

// Preserve all 68 IDs and the original 1.1–14.3, 15–40 editorial ordering.
// Numbering is not an instruction to send three emails per day.
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  ...earlyEmails,
  ...middleEmails,
  ...lateEmails,
].map((copy, index) => ({
  id: copy.id,
  audience: 'chiropractic',
  name: copy.name,
  subject: copy.subject,
  previewText: copy.previewText,
  angle: copy.angle,
  focus: copy.focus,
  html: renderMarketingEmail(copy, index),
}))

export function templatesForAudience(audience: EmailAudienceId): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter(template => template.audience === audience)
}