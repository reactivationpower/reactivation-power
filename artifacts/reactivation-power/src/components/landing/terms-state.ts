import type { CurrentLeadTerms } from '@workspace/shared/lead-terms'

export const termsId = (t: CurrentLeadTerms | null | undefined) => (t && t.active ? t.version.id : null)

/** Acceptance survives a refresh only when the active version id is unchanged. */
export function nextAccepted(prev: CurrentLeadTerms | null, next: CurrentLeadTerms, accepted: boolean): boolean {
  return termsId(prev) === termsId(next) ? accepted : false
}
