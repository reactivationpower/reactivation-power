import type { DemoPracticeKey } from './config'
import type { LeadImportRow, LeadStatus, PriceLineStyle } from '@workspace/shared/lead-followup'

/**
 * The Lead Follow-Up half of the sales demo. Only the chiro practice carries
 * the product today; the med spa stays reactivation-only so a presenter can
 * show both the two-door landing and the single-product sign-in.
 *
 * Kept out of config.ts on purpose: the web app holds a byte-for-byte copy
 * of that file for the /demo picker and a campaign story does not belong in
 * a browser bundle.
 */

export interface DemoLead extends Omit<LeadImportRow, 'submittedAt'> {
  /** Minutes before "now" the lead came in — leads are shown by age. */
  minutesAgo: number
  status?: LeadStatus
  /** Minutes before now the last attempt was made (only with a non-new status). */
  attemptedMinutesAgo?: number
}

export interface DemoLeadCampaign {
  /** Exact niche name; must be one of the practice's enabled niches. */
  niche: string
  name: string
  offerItems: string[]
  regularPriceCents: number | null
  offerPriceCents: number | null
  priceLineStyle: PriceLineStyle
  urgencyNote: string | null
  leads: DemoLead[]
}

const CHIRO_LEAD_CAMPAIGN: DemoLeadCampaign = {
  niche: 'Chiropractic',
  name: 'Back Pain Relief — $49 New Patient Special',
  offerItems: [
    'Consultation with the doctor',
    'Full spinal exam',
    'Digital X-rays if needed',
    'Report of findings visit',
    'First adjustment',
  ],
  regularPriceCents: 24900,
  offerPriceCents: 4900,
  priceLineStyle: 'normally_now',
  urgencyNote: 'Offer ends Friday — only 10 spots this week',
  leads: [
    {
      firstName: 'Melissa', lastName: 'Tran', phone: '(720) 555-0186', email: 'melissa.tran@example.com',
      requestedTime: 'Tomorrow at 3pm',
      message: 'Lower back has been bad for two weeks, saw your $49 ad on Facebook',
      minutesAgo: 12,
    },
    {
      firstName: 'Robert', lastName: 'Okafor', phone: '(303) 555-0171', email: 'r.okafor@example.com',
      message: 'Is this good for sciatica?',
      minutesAgo: 48,
    },
    {
      firstName: 'Janet', lastName: 'Kowalski', phone: '(970) 555-0133', email: 'janet.k@example.com',
      requestedTime: 'Any morning this week',
      minutesAgo: 60 * 3 + 5,
    },
    {
      firstName: 'Devin', lastName: 'Marsh', phone: '(719) 555-0158', email: 'devin.marsh@example.com',
      requestedTime: 'Saturday',
      message: 'Do you take Aetna?',
      minutesAgo: 60 * 7,
      status: 'attempted',
      attemptedMinutesAgo: 60 * 5,
    },
    {
      firstName: 'Priscilla', lastName: 'Nunez', phone: '(303) 555-0119', email: 'pnunez@example.com',
      message: 'Neck pain from desk work, headaches most afternoons',
      minutesAgo: 60 * 26,
      status: 'attempted',
      attemptedMinutesAgo: 60 * 22,
    },
    {
      firstName: 'Gary', lastName: 'Whitfield', phone: '(720) 555-0147',
      requestedTime: 'Thursday 10am',
      minutesAgo: 60 * 50,
      status: 'reached',
      attemptedMinutesAgo: 60 * 47,
    },
  ],
}

export const DEMO_LEAD_CAMPAIGNS: Partial<Record<DemoPracticeKey, DemoLeadCampaign>> = {
  chiro: CHIRO_LEAD_CAMPAIGN,
}
