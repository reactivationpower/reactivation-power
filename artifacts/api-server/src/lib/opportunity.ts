/**
 * Shared math + slider bounds for the revenue calculator.
 *
 * One set of numbers feeds three places: the hero sliders, the prefilled and
 * hidden fields on the lead form, and the results page. Keeping them here is
 * what guarantees the results page shows the same figure the visitor already
 * saw on the hero.
 *
 * The reactivation rate is intentionally conservative and is NEVER shown
 * on screen — the pages only present the resulting numbers.
 */

export const REACTIVATION_RATE = 0.05

export const INACTIVE_MIN = 100
export const INACTIVE_MAX = 5000
export const INACTIVE_STEP = 100
export const INACTIVE_DEFAULT = 1000
/** Ceiling for a hand-typed count so garbage input can't produce absurd totals. */
export const INACTIVE_TYPED_MAX = 999_999

export const VALUE_MIN = 1000
export const VALUE_MAX = 5000
export const VALUE_STEP = 100
export const VALUE_DEFAULT = 2000

export function reactivatedPatients(inactiveCount: number): number {
  return Math.max(1, Math.round(inactiveCount * REACTIVATION_RATE))
}

/**
 * Read a patient count that arrived as text (form field or URL param).
 * Anything that isn't a plain whole number falls back to the default —
 * including legacy range labels like "500-1,000" from old links.
 */
export function parseInactiveCount(raw: string | null | undefined): number {
  const digits = (raw ?? '').replace(/,/g, '').trim()
  if (!/^\d+$/.test(digits)) return INACTIVE_DEFAULT
  const n = Number(digits)
  return n < 1 ? INACTIVE_DEFAULT : Math.min(INACTIVE_TYPED_MAX, n)
}

/** Read an annual patient value from text, clamped to the slider's range. */
export function parsePatientValue(raw: string | null | undefined): number {
  const digits = (raw ?? '').replace(/[$,]/g, '').trim()
  if (!/^\d+$/.test(digits)) return VALUE_DEFAULT
  return Math.min(VALUE_MAX, Math.max(VALUE_MIN, Number(digits)))
}

/** How much of a range track to paint, for the .range-slider fill. */
export function sliderFillPercent(
  value: number,
  min: number,
  max: number,
): string {
  return `${((value - min) / (max - min)) * 100}%`
}
