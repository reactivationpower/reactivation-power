import type { DemoPracticeKey } from './config'
import type { LeadImportRow, LeadStatus, PriceLineStyle } from '@workspace/shared/lead-followup'
import { officeClock } from '@workspace/shared/lead-requested-time'

/**
 * The Lead Follow-Up half of each sales demo. Each practice has its own
 * campaigns and leads, refreshed relative to the time of its rebuild.
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
  /** Requested office slot, anchored to reset time rather than submission age. */
  appointmentSlot?: { daysAhead: number; hour: number; minute?: number }
}

/** Absolute office wall-clock text accepted literally by parseRequestedTime. */
export function demoAppointmentTime(now: Date, slot: { daysAhead: number; hour: number; minute?: number }): string {
  if (!Number.isInteger(slot.daysAhead) || slot.daysAhead < 1 || !Number.isInteger(slot.hour) || slot.hour < 0 || slot.hour > 23 ||
    !Number.isInteger(slot.minute ?? 0) || (slot.minute ?? 0) < 0 || (slot.minute ?? 0) > 59) {
    throw new Error('Invalid demo appointment slot')
  }
  const officeToday = officeClock(now)
  const date = new Date(Date.UTC(officeToday.getFullYear(), officeToday.getMonth(), officeToday.getDate() + slot.daysAhead))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(slot.hour)}:${pad(slot.minute ?? 0)}`
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

export const DEMO_LEAD_CAMPAIGNS: Record<DemoPracticeKey, readonly DemoLeadCampaign[]> = {
  chiro: [
    CHIRO_LEAD_CAMPAIGN,
    {
      niche: 'Acoustic Wave Therapy',
      name: 'SoftWave / Shockwave — $49 Introductory Consultation and Treatment',
      offerItems: ['Introductory consultation', 'SoftWave / shockwave treatment session'],
      regularPriceCents: null,
      offerPriceCents: 4900,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Holly', lastName: 'Warren', phone: '(303) 555-0126', email: 'holly.warren@example.com',
          message: 'Saw the SoftWave offer. Would it be worth discussing for my heel pain?',
          minutesAgo: 24,
        },
        {
          firstName: 'Andre', lastName: 'Bishop', phone: '(720) 555-0149', email: 'andre.bishop@example.com',
          requestedTime: 'Tomorrow afternoon',
          message: 'I have had shoulder pain for months. What does the first visit include?',
          minutesAgo: 60 * 27 + 15,
          status: 'attempted',
          attemptedMinutesAgo: 60 * 25,
        },
        {
          firstName: 'Denise', lastName: 'Park', phone: '(970) 555-0152',
          message: 'Interested in shockwave treatment for my Achilles tendon.',
          minutesAgo: 60 * 57 + 30,
          status: 'reached',
          attemptedMinutesAgo: 60 * 54,
        },
      ],
    },
    {
      niche: 'Decompression',
      name: 'Spinal Decompression — $49 Consultation and Evaluation',
      offerItems: ['Spinal decompression consultation', 'Evaluation with the doctor'],
      regularPriceCents: null,
      offerPriceCents: 4900,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Elliot', lastName: 'Ramirez', phone: '(719) 555-0181', email: 'elliot.ramirez@example.com',
          requestedTime: 'Tomorrow morning',
          message: 'Can we talk about decompression for a bulging disc?',
          minutesAgo: 41,
        },
        {
          firstName: 'Monica', lastName: 'Price', phone: '(303) 555-0139', email: 'monica.price@example.com',
          message: 'Lower back pain has been going down my leg. I would like an evaluation.',
          minutesAgo: 60 * 30 + 20,
          status: 'attempted',
          attemptedMinutesAgo: 60 * 28,
        },
        {
          firstName: 'Caleb', lastName: 'Foster', phone: '(720) 555-0167',
          requestedTime: 'Next week in the afternoon',
          message: 'Wondering whether spinal decompression is an option for me.',
          minutesAgo: 60 * 62,
          status: 'reached',
          attemptedMinutesAgo: 60 * 59,
        },
      ],
    },
    {
      niche: 'Neuropathy',
      name: 'Neuropathy — $49 Consultation and Examination',
      offerItems: ['Neuropathy consultation', 'Examination with the doctor'],
      regularPriceCents: null,
      offerPriceCents: 4900,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Wanda', lastName: 'Ellis', phone: '(970) 555-0114', email: 'wanda.ellis@example.com',
          message: 'My feet have been tingling at night. I would like to have them checked.',
          minutesAgo: 68,
        },
        {
          firstName: 'Peter', lastName: 'Gomez', phone: '(303) 555-0183', email: 'peter.gomez@example.com',
          requestedTime: 'Any weekday morning',
          message: 'Interested in the $49 exam for numbness in my toes.',
          minutesAgo: 60 * 26 + 40,
          status: 'attempted',
          attemptedMinutesAgo: 60 * 24,
        },
        {
          firstName: 'Sharon', lastName: 'Liu', phone: '(719) 555-0191',
          message: 'I have burning in both feet and want to know what the exam involves.',
          minutesAgo: 60 * 55 + 50,
          status: 'reached',
          attemptedMinutesAgo: 60 * 52,
        },
      ],
    },
    {
      niche: 'Red Light / Body Contouring',
      name: 'Body Contouring / Red Light — $37 Single Session',
      offerItems: ['One red light body contouring session'],
      regularPriceCents: null,
      offerPriceCents: 3700,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Alyssa', lastName: 'Carter', phone: '(720) 555-0137', email: 'alyssa.carter@example.com',
          message: 'Saw your $37 single-session offer and would like to learn how it works.',
          minutesAgo: 15,
        },
        {
          firstName: 'Janelle', lastName: 'Morgan', phone: '(303) 555-0176', email: 'janelle.morgan@example.com',
          requestedTime: 'Tomorrow after lunch',
          message: 'I would like to try one red light session first.',
          minutesAgo: 60 * 29 + 10,
          status: 'attempted',
          attemptedMinutesAgo: 60 * 27,
        },
        {
          firstName: 'Tracy', lastName: 'Nguyen', phone: '(970) 555-0129',
          message: 'Is the one-session body contouring offer available this week?',
          minutesAgo: 60 * 64 + 10,
          status: 'reached',
          attemptedMinutesAgo: 60 * 61,
        },
      ],
    },
    {
      niche: 'Red Light / Body Contouring',
      name: 'Body Contouring / Red Light — $164 Three-Session Package',
      offerItems: ['Three red light body contouring sessions'],
      regularPriceCents: null,
      offerPriceCents: 16400,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Kendra', lastName: 'Sullivan', phone: '(303) 555-0157', email: 'kendra.sullivan@example.com',
          message: 'Can you tell me more about the three-session red light package?',
          minutesAgo: 73,
        },
        {
          firstName: 'Leah', lastName: 'Johnson', phone: '(719) 555-0135', email: 'leah.johnson@example.com',
          requestedTime: 'Next week in the morning',
          message: 'I saw the $164 body contouring series and would like to discuss it.',
          minutesAgo: 60 * 32 + 25,
          status: 'attempted',
          attemptedMinutesAgo: 60 * 30,
        },
        {
          firstName: 'Erin', lastName: 'Walker', phone: '(720) 555-0116',
          message: 'Interested in booking the three-session red light offer.',
          minutesAgo: 60 * 59 + 40,
          status: 'reached',
          attemptedMinutesAgo: 60 * 56,
        },
      ],
    },
  ],
  aesthetics: [
    {
      niche: 'Acne / Acne Scarring',
      name: 'Acne Scarring / Skin Rejuvenation — $49 Consultation',
      offerItems: ['Skin and scar consultation', 'Personalized skin rejuvenation plan'],
      regularPriceCents: null,
      offerPriceCents: 4900,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Keira', lastName: 'Mendoza', phone: '(480) 555-0148', email: 'keira.mendoza@example.com',
          appointmentSlot: { daysAhead: 2, hour: 14 },
          message: 'I have old acne scars on my cheeks and want to know what might help.',
          minutesAgo: 18,
        },
        {
          firstName: 'Nia', lastName: 'Patel', phone: '(602) 555-0184', email: 'nia.patel@example.com',
          appointmentSlot: { daysAhead: 5, hour: 10, minute: 30 },
          message: 'Would the consultation cover texture and marks from breakouts?',
          minutesAgo: 60 * 25 + 12,
        },
        {
          firstName: 'April', lastName: 'Santos', phone: '(623) 555-0136',
          message: 'Interested in options for acne scarring before an event later this year.',
          minutesAgo: 60 * 58,
          status: 'reached',
          attemptedMinutesAgo: 60 * 54,
        },
      ],
    },
    {
      niche: 'Cellulite Reduction',
      name: 'Cellulite Reduction / Body Sculpting — $37 New-Patient Package',
      offerItems: ['Body contouring consultation', 'Introductory body sculpting session', 'Personalized treatment plan'],
      regularPriceCents: null,
      offerPriceCents: 3700,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Marissa', lastName: 'Cole', phone: '(480) 555-0169', email: 'marissa.cole@example.com',
          appointmentSlot: { daysAhead: 3, hour: 11 },
          message: 'I saw the $37 new-patient package. Can we talk about my thighs?',
          minutesAgo: 60 * 2 + 8,
        },
        {
          firstName: 'Talia', lastName: 'Brooks', phone: '(602) 555-0127', email: 'talia.brooks@example.com',
          appointmentSlot: { daysAhead: 6, hour: 16 },
          message: 'Looking into body sculpting for my hips and thighs.',
          minutesAgo: 60 * 31,
        },
        {
          firstName: 'Daphne', lastName: 'Kim', phone: '(623) 555-0192',
          message: 'How does the new-patient package work?',
          minutesAgo: 60 * 67 + 20,
          status: 'reached',
          attemptedMinutesAgo: 60 * 63,
        },
      ],
    },
    {
      niche: 'Microneedling / RF Microneedling',
      name: 'Microneedling / Aesthetics — $49 Consultation',
      offerItems: ['Microneedling consultation', 'Personalized aesthetics treatment plan'],
      regularPriceCents: null,
      offerPriceCents: 4900,
      priceLineStyle: 'offer_only',
      urgencyNote: null,
      leads: [
        {
          firstName: 'Elise', lastName: 'Morgan', phone: '(480) 555-0113', email: 'elise.morgan@example.com',
          appointmentSlot: { daysAhead: 4, hour: 13 },
          message: 'Curious whether microneedling could help with uneven skin texture.',
          minutesAgo: 44,
        },
        {
          firstName: 'Priya', lastName: 'Hale', phone: '(602) 555-0156', email: 'priya.hale@example.com',
          appointmentSlot: { daysAhead: 7, hour: 15, minute: 30 },
          message: 'Is RF microneedling one of the options we could discuss?',
          minutesAgo: 60 * 20 + 35,
        },
        {
          firstName: 'Camila', lastName: 'Reyes', phone: '(623) 555-0174',
          message: 'I would like to discuss microneedling for fine lines.',
          minutesAgo: 60 * 52 + 10,
          status: 'reached',
          attemptedMinutesAgo: 60 * 49,
        },
      ],
    },
  ],
}
