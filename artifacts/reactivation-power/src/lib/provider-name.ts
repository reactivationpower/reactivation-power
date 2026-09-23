import type { Sector } from '@workspace/shared/types'

/**
 * How the scripts refer to the provider. Every `{{provider_name}}` in the
 * flows sits mid-sentence ("... so {{provider_name}} can take a look",
 * "{{provider_name}} will be glad to know ..."), so the value has to read
 * the way a staff member would actually say it on the phone.
 *
 * - Healthcare accounts with a doctor on file: "Dr. Whitaker" (last name only;
 *   never "Dr. Daniel Whitaker" and never the business name, which makes the
 *   call sound like it comes from a call centre).
 * - Anything else (no last name, non-healthcare sector): "the whole office".
 *   `mergeScript` capitalises it when it opens a sentence.
 */
export const PROVIDER_FALLBACK = 'the whole office'

export interface ProviderSource {
  first_name?: string | null
  last_name?: string | null
}

export function spokenProviderName(
  owner: ProviderSource | null | undefined,
  sector: Sector | null | undefined,
): string | null {
  if (!owner || sector !== 'healthcare') return null
  const last = (owner.last_name ?? '').trim()
  if (!last) return null
  return `Dr. ${last}`
}

/** Tokens derived from the provider: `provider_name` and the Open's credibility line. */
export function providerTokens(
  providerName: string | null,
  isProvider: boolean,
): Record<string, string> {
  const provider_name = providerName ?? PROVIDER_FALLBACK
  const asked_by_provider = isProvider
    ? 'I wanted to reach out to you personally.'
    : providerName
      ? `${providerName} asked me to reach out to you personally.`
      : 'We wanted to reach out to you personally.'
  return { provider_name, asked_by_provider }
}
