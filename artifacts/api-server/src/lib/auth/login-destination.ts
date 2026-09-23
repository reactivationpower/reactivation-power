import { landingPathFor, type ProductAccess } from '@workspace/shared/lead-followup'

/**
 * Where a fresh login goes. An explicit same-origin `next` (a deep link that
 * bounced to the login page) wins; otherwise accounts holding both products
 * get the two-door chooser and everyone else lands in reactivation.
 */
export function resolveLoginDestination(next: string, access: ProductAccess): string {
  if (next && /^\/(?![\/\\])/.test(next)) return next
  return landingPathFor(access)
}
