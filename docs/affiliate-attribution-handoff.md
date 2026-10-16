# Affiliate intake handoff

The website owns qualified intake; the internal sales CRM may reuse the resolver but does not own financial calculations.

- `captureAffiliateReferral(code)` validates an approved random referral code and sets a signed, HttpOnly 90-day cookie. Invalid codes do not overwrite valid context.
- After provider validation and consent, `referralFromRequest(email)` reads verified referral context. Never trust a submitted affiliate ID or cookie body directly.
- `resolveQualifiedReferral({email, phone, practiceName, affiliateId, sourceLeadId})` returns `{leadId, affiliateId}`. Persist this canonical `leadId` in any CRM handoff. It is not a patient ID and no clinical data belongs here.
- Email and phone identifiers are keyed digests. Only an exact normalized email identifies a repeat lead or automatically attaches/locks a customer. Phone-only matches never assign attribution; unmatched customer emails remain unattributed for a reasoned admin correction. Qualified submissions with different emails create separate leads even if their phone is shared.
- Only a fresh qualified submission after five elapsed days can replace attribution. A click or the passage of time cannot. Conversion locks the lead.
- Payment-link enrollment automatically attaches a reliably matched qualified lead. It does not assign an affiliate to unrelated existing customers.
- If the link already exists when a qualified exact-email submission arrives, conversion attaches that lead with an effective time of conversion. Existing assignments (including explicit removal) and conversions predating the qualified submission prevent automatic attachment; earlier payments cannot be retroactively credited.
- Admin corrections are super-admin actions requiring a reason. A converted lead is corrected through its customer. These append attribution history and never rewrite earned commissions or wires.
- `calculateAffiliateHistory` is an explicit customer-scoped historical assignment/calculation. Ordinary webhook retries process only actual recorded billing work and cannot invent historical attribution.

## Financial conventions

All financial input is integer cents. Percentage rules use integer basis points (1000 = 10%). Flat recurring rules are per successful monthly payment; flat one-time rules are per closed paid sale. Setup fees are excluded. Snapshots preserve earning-time rules.

Billing work, reversals, and wire allocations are durable and idempotent. Refunds/disputes reconcile a cumulative commission loss; a refund overlapping a dispute is not subtracted twice. Negative balances survive every calendar boundary.

Affiliate SQL tables are intentionally managed in the reviewed custom migration and SQL repositories, not by schema push. Do not add a second Drizzle-created copy without first reconciling migration snapshots.

## Access and telemetry

Affiliates have their own inbox-verified challenge and session tables/cookie. An access-entry link only selects an inbox-verification flow, never grants a session. Practice owner/caller authentication remains unchanged.

The backend projects only practice names, statuses, payment/commission amounts, snapshots, balances, and payout references. No customer contact, clinical, agreement, card, or staff-note fields can be returned to affiliates. Admin candidate lookup is separately super-admin protected.

Only the adjacent loopback ingress is trusted for appended IP headers; leftmost forwarded hops and geographic headers are ignored. Without a reliable geographic source, country/region remain unavailable. The UI labels any location approximate and does not identify a human behind a shared inbox.

Daily authentication cleanup strips IP/location after 30 days and deletes affiliate navigation/visit telemetry after 90 days. Financial/admin audit history is retained. Tests must use disposable isolated schemas with no public fallback; development and production share Supabase.
