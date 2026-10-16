/** Authored prospect copy, independent of the email-client-safe HTML renderer. */
export interface MarketingEmailCopy {
  /** Preserve the existing template ID so saved selections and exports remain stable. */
  id: string
  /** Keep the original Email X / Email X.Y numbering prefix. */
  name: string
  subject: string
  previewText: string
  angle: string
  focus: 'reactivation' | 'lead-follow-up' | 'combined'
  headline: string
  paragraphs: string[]
  calloutTitle: string
  points: string[]
  closing: string
  ctaLabel: string
}