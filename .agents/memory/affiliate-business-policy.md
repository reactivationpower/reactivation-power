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

Affiliates see practice names and billing status, not customer contact details. Affiliate access should be passwordless and branded access emails should use Resend.

**Why:** The user explicitly limited affiliate visibility and requested simple emailed access.

**How to apply:** Enforce restricted fields and affiliate scope server-side; keep passwordless affiliate access separate from the owner/caller password policy and require actual inbox verification.

No affiliate commissions on setup fees. Monthly and one-time/full payments can earn commissions configured as percentages or flat amounts. Affiliate defaults are editable and customer/deal overrides are allowed. Recurring commissions continue as long as the customer keeps paying; commissions are earned only on dollars collected for eligible active customers.

**Why:** The user explicitly selected these compensation terms.

**How to apply:** Keep external affiliate compensation distinct from internal sales-rep commission policy and do not apply affiliate exclusions to rep pay.

Refunds and chargebacks claw back the associated commission from future affiliate earnings, carrying the debt forward even through months without new referrals. Payouts are monthly, without a minimum balance or added waiting period. Wires are sent outside the app; admin records payment date/amount and the earning month's reference, then a branded notification is sent.

**Why:** The user requires durable recovery of previously paid commissions and distinguishes transaction month from actual payout date.

**How to apply:** Preserve financial history and explicit adjustments; never reset clawback balances at month boundaries or claim the application performed a wire.
