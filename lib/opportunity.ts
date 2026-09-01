/**
 * Shared math + defaults for the "your reactivation opportunity" results page.
 *
 * The reactivation rate is intentionally conservative and is NEVER shown
 * on screen — the page only presents the resulting numbers.
 */

export const REACTIVATION_RATE = 0.05

/**
 * Conservative (low-end) patient counts for each form range.
 * Using the low end keeps the projection believable.
 */
export const INACTIVE_RANGE_LOW_END: Record<string, number> = {
  'Under 100': 50,
  '100-500': 100,
  '500-1,000': 500,
  '1,000-5,000': 1000,
  '5,000+': 5000,
  'Not sure': 300,
}

/**
 * Typical annual patient value per healthcare niche, used to pre-set the
 * slider based on the services the lead selected. These are starting
 * defaults — the lead adjusts the slider to their real number.
 */
export const NICHE_ANNUAL_VALUE: Record<string, number> = {
  'Acoustic Wave Therapy': 2500,
  Acupuncture: 900,
  'Body Waxing': 600,
  Botox: 1500,
  'Cellulite Reduction': 1200,
  Chiropractic: 1000,
  ChiroThin: 1200,
  'Weight Loss (Not ChiroThin)': 1200,
  'Clear Aligners': 3500,
  Decompression: 2500,
  'Dental Implants': 4000,
  'GLP Patients': 3000,
  'Gut Health': 1200,
  'Joint Pain': 1500,
  'Laser Hair Removal': 1000,
  'Massage Therapy': 800,
  'Med Spa': 1500,
  Neuropathy: 3000,
  'Orthodontics / Braces': 4500,
  'Red Light / Body Contouring': 1500,
  'Skin Tightening': 1400,
  'Teeth Whitening': 400,
}

export const FALLBACK_ANNUAL_VALUE = 800

export const SLIDER_MIN = 100
export const SLIDER_MAX = 5000
export const SLIDER_STEP = 50

/** Average the defaults of the selected services, snapped to the slider step. */
export function defaultValueForServices(services: string[]): number {
  const known = services
    .map((s) => NICHE_ANNUAL_VALUE[s])
    .filter((v): v is number => typeof v === 'number')
  if (known.length === 0) return FALLBACK_ANNUAL_VALUE
  const avg = known.reduce((a, b) => a + b, 0) / known.length
  const snapped = Math.round(avg / SLIDER_STEP) * SLIDER_STEP
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, snapped))
}

export function inactiveCountForRange(range: string): number {
  return INACTIVE_RANGE_LOW_END[range] ?? INACTIVE_RANGE_LOW_END['Not sure']
}

export function reactivatedPatients(inactiveCount: number): number {
  return Math.max(1, Math.round(inactiveCount * REACTIVATION_RATE))
}
