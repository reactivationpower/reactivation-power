---
name: Stripe modes & billing tables
description: Why Stripe test vs live is a startup-time switch, why billing data is split across two databases, and traps hit while verifying checkout.
---
- Project env Stripe keys are LIVE. Verify checkout only in the workspace, where the API boots in test mode from the Replit Stripe integration sandbox (`STRIPE_MODE` overrides). Sandbox and live are separate Stripe accounts, so links created in one mode cannot be completed in the other.
  **Why:** the user asked for "build in sandbox, flip a switch to go live"; an earlier attempt to test against live keys created real PaymentIntents.
- Billing data is split: Supabase (no DDL access) keeps the link identity/paid flag and enforces `amount_cents > 0`; Replit Postgres holds customers/terms/cards. Test cleanup has to touch both plus the Supabase participants provisioned for the link.
- Stripe idempotency keys must not be permanent for objects that may be deleted during testing (a deleted customer is replayed for the same key for 24h) — bucket them by time.
- Card records must be scoped to the link/agreement, not just the customer: a repeat customer's earlier cards would otherwise be compared and billed instead of the ones just entered.
