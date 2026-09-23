import { formatDollars, type PriceLineStyle } from './lead-followup.ts'

/**
 * Merge tokens a LEAD script reads from the campaign the lead answered.
 * Every key is always present in the returned map (empty string when the
 * campaign has nothing to say), so a lead flow never shows a raw
 * `[OFFER PRICE]` bracket: the player drops an empty paragraph and an empty
 * mid-sentence token just leaves the sentence shorter.
 *
 * The flow lint's KNOWN_TOKENS list imports CAMPAIGN_TOKEN_KEYS, so adding a
 * key here is what makes it legal in a `*.lead.json` file.
 */
export const CAMPAIGN_TOKEN_KEYS = [
  'offer_name',
  'offer_items',
  'offer_items_spoken',
  'regular_price',
  'offer_price',
  'price_line',
  'urgency_note',
  'submitted_date',
  'submitted_ago',
] as const
export type CampaignTokenKey = (typeof CAMPAIGN_TOKEN_KEYS)[number]
export type CampaignTokens = Record<CampaignTokenKey, string>

export interface CampaignTokenSource {
  name: string
  offerItems: string[]
  regularPriceCents: number | null
  offerPriceCents: number | null
  priceLineStyle: PriceLineStyle | string
  urgencyNote: string | null
}

export interface LeadTokenSource {
  submittedAt: string | Date | null
}

/** Bullet marker the player recognises as a list paragraph. */
export const OFFER_ITEM_BULLET = '\u2022'

/**
 * The spoken price sentence for a campaign, matching the style the owner
 * picked on the campaign form:
 *   normally_now -> "Normally $379, but through this campaign it's $37."
 *   offer_only   -> "It's just $37."
 *   no_price     -> "" (the script says nothing about money)
 * A style that needs a price the campaign has not recorded yet also yields
 * "" rather than "Normally $0".
 */
export function campaignPriceSentence(c: {
  priceLineStyle: PriceLineStyle | string
  regularPriceCents: number | null
  offerPriceCents: number | null
}): string {
  if (c.priceLineStyle === 'no_price') return ''
  if (c.offerPriceCents === null) return ''
  const offer = formatDollars(c.offerPriceCents)
  if (c.priceLineStyle === 'offer_only') return `It\u2019s just ${offer}.`
  if (c.regularPriceCents === null) return ''
  return `Normally ${formatDollars(c.regularPriceCents)}, but through this campaign it\u2019s ${offer}.`
}

/** "an exam, X-rays and a report of findings" — for reading the items in one breath. */
export function spokenList(items: string[]): string {
  const clean = items.map((i) => i.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

export function formatSubmittedDate(when: string | Date | null, now: Date = new Date()): string {
  if (!when) return ''
  const d = typeof when === 'string' ? new Date(when) : when
  if (!Number.isFinite(d.getTime())) return ''
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "earlier today" / "yesterday" / "a few days ago" / "a couple of weeks ago" — how a caller would say it. */
export function spokenAgo(when: string | Date | null, now: Date = new Date()): string {
  // No lead (practice page) or an unparseable date: "You reached out recently about..."
  if (!when) return 'recently'
  const d = typeof when === 'string' ? new Date(when) : when
  if (!Number.isFinite(d.getTime())) return 'recently'
  // Calendar days, not 24-hour blocks: a form filled at 9 pm is "yesterday"
  // on a 9 am call, the way a person would say it.
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days <= 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 7) return 'a few days ago'
  if (days < 21) return 'a couple of weeks ago'
  return 'a little while ago'
}

export function campaignTokens(
  campaign: CampaignTokenSource,
  lead: LeadTokenSource | null,
  now: Date = new Date(),
): CampaignTokens {
  const items = campaign.offerItems.map((i) => i.trim()).filter(Boolean)
  return {
    offer_name: campaign.name.trim() || 'special offer',
    offer_items: items.map((i) => `${OFFER_ITEM_BULLET} ${i}`).join('\n'),
    offer_items_spoken: spokenList(items),
    regular_price: campaign.regularPriceCents === null ? '' : formatDollars(campaign.regularPriceCents),
    offer_price: campaign.offerPriceCents === null ? '' : formatDollars(campaign.offerPriceCents),
    price_line: campaignPriceSentence(campaign),
    urgency_note: (campaign.urgencyNote ?? '').trim(),
    submitted_date: formatSubmittedDate(lead?.submittedAt ?? null, now),
    submitted_ago: spokenAgo(lead?.submittedAt ?? null, now),
  }
}
