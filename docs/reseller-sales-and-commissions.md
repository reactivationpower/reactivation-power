# Reseller sales and commissions

Patient Pipeline remains the seller, payment collector and service provider. A reseller is an external selling company, not an affiliate, staff team, merchant account or practice user.

## Access and sales

- Owner administration: **Admin → Resellers**. Create a company, invite each named manager/salesperson, review sales, onboarding and balances, record externally executed wires, or end the relationship with a reason.
- Personal reseller logins use the existing admin sign-in page and go to `/resellers`, never to the internal staff workspace.
- Managers see their own company's prospects, sales, reports and payment onboarding. Salespeople see only assigned prospects and sales permanently attributed to them. Reassigning a prospect does not transfer an earlier sale's attribution.
- Every reseller session checks current membership and relationship status. Deactivated members and terminated companies lose access even with an existing cookie.
- Notes, call dispositions, next-follow-up dates and opt-outs are recorded here. Communication is external and manual. Reseller prospects are separate tables and never enter internal leads, GoHighLevel synchronization, booking, import or messaging selectors. The public fictional demos remain available.
- Matches to an existing customer require a reasoned owner identity review. This authorizes future offers only; it does not reassign past earnings, clear consent restrictions or change existing customer access.

## Approved pricing and enrollment

Selling is disabled until the owner saves the standard lifetime purchase, monthly subscription and setup prices. Prices are integer cents. The lifetime purchase discount is at most $1,000; the monthly discount is at most $100. Neither amount can exceed its approved standard or go below the minimum checkout charge.

The existing lifetime checkout has one lifetime-purchase charge, with no separate setup charge. The existing subscription checkout has a separately identified setup fee: the reseller must charge the exact owner-set setup price, including when the owner explicitly sets it to zero. Resellers cannot waive or change that fee, service terms, cancellation rules or agreement text.

Offers reuse the existing customer identity, agreement, signing, trial, Stripe enrollment, service access and durable enrollment invitation. Offer creation snapshots approved prices and company/salesperson attribution; later price changes, assignments or staff changes do not rewrite the sale. Unsigned agreement edits enforce those same frozen price limits. Completed agreements retain the existing signing/edit concurrency protections.

## Earnings and reversals

The company earns 20% of eligible money actually collected, not invoiced or promised revenue. Lifetime purchase collections qualify. Subscription invoice line evidence distinguishes recurring service from setup, including mixed invoices and paginated line collections. Setup fees never earn commission. Part-paid mixed invoices are proportionally allocated. Affiliate referral history stays intact, but a reseller sale cannot also earn affiliate or internal-representative commission.

Collections use durable source identities to avoid duplicate credits. Refund amounts and dispute loss evidence are cumulative and source-linked. Overlapping refund/dispute events do not double deduct. Winning a dispute restores only its dispute-related loss, not legitimate refunds. Early refunds/disputes remain recoverable when the collection arrives later. Corrections require an owner, reason and idempotency key; financial history is never deleted or silently reassigned.

Eligibility uses effective collection, subscription-state and relationship times, not webhook arrival time. Termination immediately stops access and future eligible earnings. Already-earned unpaid money remains payable, subject to later source-linked clawbacks. Negative balances persist across periods, payouts, inactivity and termination.

## Secure onboarding and external payouts

Company managers submit U.S. wire details and a completed/signed W-9. Intake reuses the established PDF validation and authenticated encryption but has distinct reseller-company encryption binding and access checks. Fresh personal sign-in is required for changing existing sensitive details; idle-session checks still apply.

Owners see masked readiness by default. Revealing bank details, downloading a W-9 or approving a specific onboarding version is an audited owner action. Salespeople cannot access company bank/tax documents.

Use **Record external wire** only after the company has actually been paid outside this app. The app records amount, earning period, sent date, reference and ledger allocations. Company locking, a durable request key and net-payable checks prevent concurrent double payment recording or paying through debt. The app does not initiate or claim to initiate a transfer.

Payment notifications have a durable frozen-recipient delivery record, provider deduplication, retry leases and an owner-visible recovery action. An uncertain send beyond the provider's deduplication window requires checking delivery before retrying.

## Migration and rollout

The additive reseller migration creates dedicated tables and revokes direct public/client access. There is no automatic historical assignment, financial backfill, partner conversion or customer permission migration. Existing staff and affiliate identities remain unchanged.

Before opening the program after merge/publication, update **all serving hosts and Stripe webhook processors** sharing the database. Do not invite companies or configure active selling while an older webhook processor can still handle the new sales without reseller ledger support. Then the owner sets approved prices and verifies invitation delivery with an authorized inbox. This task does not deploy production or verify real email, charge or wire delivery.

## Verification

The reseller database suite uses a disposable schema, multiple companies and reps, synthetic customer/payment sources, and mocked Stripe, Supabase invitations and email. It covers scoped access, old-session revocation, frozen attribution, price boundaries and edits, existing-identity review, duplicate/late collections, setup exclusion, refund/dispute overlap and recovery, termination, encrypted onboarding/version checks, debt and concurrent payout retries.

Ordinary `pnpm test` runs must not create Stripe sandbox charges. The pre-existing external Stripe billing suite now requires explicit `RUN_STRIPE_INTEGRATION_TESTS=1`; run it only when authorized to create its disposable sandbox subscriptions and charges. Existing mocked billing/affiliate/agreement/internal CRM regressions remain part of ordinary tests.
