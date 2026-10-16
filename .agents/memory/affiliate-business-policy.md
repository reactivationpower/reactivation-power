---
name: Affiliate business policy
description: User-selected referral, commission, payout, and affiliate-visibility rules.
---
Affiliates may join by invitation or application with approval. Referral links go to the strategy-call landing page and persist for 90 days. The original qualified submission's affiliate is protected for five full elapsed days. Only a new qualified submission after that window can switch attribution; time passing alone cannot. Conversion locks attribution, including a waived-setup enrollment. Admin corrections require a recorded reason.

**Why:** These are the user's business rules, not implementation defaults.

**How to apply:** Preserve this distinction between latest referral clicks and submission attribution protection; make boundary behavior explicit before changing it.

Automatic identity matching must use an exact normalized email, never a shared phone number. A different qualified email represents a separate lead; enrollment without an exact qualified email match remains unattributed until a reasoned admin correction.

**Why:** Unrelated practices can share an office or booking-centre number. Phone-only matching can pay the wrong affiliate and expose another practice's financial information.

**How to apply:** Keep the same identity boundary at submission, enrollment attachment, and conversion locking. Do not reintroduce a single-phone-candidate fallback.

Admin attribution contact names are a read-only convenience, not a new identity policy. Treat multiple sales records sharing a normalized email as ambiguous; missing legacy names should remain explicitly missing rather than being invented or mass-backfilled.

**Why:** The user requested clearer contact selection without changing referral matching or attribution policy. A plausible name from a shared practice is not reliable identity evidence.

**How to apply:** Keep contact enrichment confined to super-admin candidate responses and use existing exact-email evidence; do not leak enriched identity into affiliate reports.

Affiliates see practice names and billing status, not customer contact details. Affiliate access should be passwordless and branded access emails should use Resend.

**Why:** The user explicitly limited affiliate visibility and requested simple emailed access.

**How to apply:** Enforce restricted fields and affiliate scope server-side; keep passwordless affiliate access separate from the owner/caller password policy and require actual inbox verification.

Affiliate payment onboarding is U.S.-only. The user now explicitly requests secure storage of wire instructions and signed W-9 PDFs, superseding the earlier exclusion of bank-detail storage. Do not collect SSNs/EINs separately in contact fields.

**Why:** The user selected U.S. recipients and requested secure payment onboarding while preserving externally executed monthly wires.

**How to apply:** Require independent server-side encryption secrets, inbox-verified access, masked ordinary responses, and audited super-admin access to sensitive data. Receipt is not IRS validation or bank verification; onboarding must not change earnings or imply a transfer occurred.

Keep bounded W-9 content encrypted alongside the versioned payment submission rather than introducing an independently updated document link.

**Why:** Atomic receipt of the contact, wire and tax-document bundle was prioritized over storage scaling, so a failed update cannot leave the profile referring to an absent or mismatched document.

**How to apply:** If document volume later warrants object storage, preserve authenticated encryption and atomic version association, with private storage, orphan cleanup and no public document URLs. See `docs/affiliate-onboarding-security.md` for key rotation and retention operations.

No affiliate commissions on setup fees. Monthly and one-time/full payments can earn commissions configured as percentages or flat amounts. Affiliate defaults are editable and customer/deal overrides are allowed. Recurring commissions continue as long as the customer keeps paying; commissions are earned only on dollars collected for eligible active customers.

**Why:** The user explicitly selected these compensation terms.

**How to apply:** Keep external affiliate compensation distinct from internal sales-rep commission policy and do not apply affiliate exclusions to rep pay.

Refunds and chargebacks claw back the associated commission from future affiliate earnings, carrying the debt forward even through months without new referrals. Payouts are monthly, without a minimum balance or added waiting period. Wires are sent outside the app; admin records payment date/amount and the earning month's reference, then a branded notification is sent.

**Why:** The user requires durable recovery of previously paid commissions and distinguishes transaction month from actual payout date.

**How to apply:** Preserve financial history and explicit adjustments; never reset clawback balances at month boundaries or claim the application performed a wire.
