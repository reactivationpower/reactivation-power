---
name: Stripe dunning policy decisions
description: Non-obvious rules behind the failed-payment flow (one attempt per card per invoice, fresh-state reconciliation, billing gate on every portal route) and how billing paths get verified without the Stripe CLI
---
- **One attempt per card per invoice.** Every failed `invoices.pay` we make emits another `invoice.payment_failed`; deciding the next card from "which card just failed" alternates forever. Decide from the set of cards that have already declined on that invoice, and stop once both are in it.
- **Reconcile subscription-status events against fresh Stripe state** (live subscription status + open invoices), never the payload: webhooks are unordered and a delayed `past_due` arrived after the backup card had already paid.
- **Stripe's retry schedule is a Dashboard setting**, not per-subscription API — handlers must stay idempotent because Stripe may still retry.
- **The billing gate must sit on every portal-authenticated route** (media streaming, progress, RPC auth), not just page loaders — a paused account still holds a valid cookie.
- Portal access is keyed on the customer's billing status resolved owner-first; staff inherit the owner's block; demo accounts are never gated.

**Why:** business rule is card 1 → immediately card 2 → shut off; a code review caught the alternating-retry loop, the stale-event re-lock, and the media bypass.

**Verifying without the Stripe CLI (not installed):** a throwaway vitest file under the api-server `src` tree (path aliases only resolve there) can drive the sandbox with `pm_card_chargeCustomerFail` / `pm_card_visa`, create an invoice item + finalized invoice, trigger the decline with `invoices.pay`, then call the handlers directly. Temporary admin logins come from `supabase.auth.admin.createUser` with the admin app_metadata; clean up Stripe customer, Postgres rows, Supabase participants/links and the auth user afterwards.
