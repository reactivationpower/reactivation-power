---
name: Transactional email via Resend
description: Constraints learned wiring Resend sends, sender domains, and email delivery logging.
---
- The Resend connector key is send-only: `GET /domains` returns 401, so domain verification and open/click tracking can only be changed in the Resend dashboard by the owner. Probe a sender by POSTing to `/emails` with `delivered@resend.dev` (Resend's sink address) — a 403 names the unverified domain.
- `patientpipeline.app` was confirmed verified by the user and a successful Resend sink-send probe on 2026-10-02; use it for future senders (see outgoing-email-domain.md). Do not assume apex verification verifies subdomains. **Why:** sends from an unverified subdomain previously failed.
- Email logging is the drizzle `email_log` table in Supabase (moved from the Replit DB in Sept 2026). Resend webhook events match rows by `provider_id`.
- `sendEmail` must never throw: it is called inside payment confirmation and account provisioning where a mail failure must not roll back business writes.
- Tailwind `data-horizontal:` variant used by `components/ui/tabs.tsx` is not defined in the web app's CSS; put `flex flex-col` on `<Tabs>` explicitly or the tab panels lay out in a row and overflow.
- To e2e-test admin pages, create a temporary super admin through `auth.admin.createUser` with `app_metadata` role fields (run via a throwaway vitest file since tsx is not installed) and delete it afterwards.
- Once-per-event customer emails need an outbox row with a unique key (e.g. type + invoice) claimed *before* sending; checking `email_log` first is a read-then-send race (Stripe delivers `invoice.paid` and `subscription.updated` concurrently) and gives no retry path. Store the rendered template data on the row so a provider failure can be re-sent from the cron. **Why:** a code review rejected the log-lookup version for duplicates and silent loss.
- Treat a delivery failure as terminal for that individual email attempt; requesting a fresh email creates a separate attempt, not a repaired historical send.
  **Why:** webhook arrival order is not guaranteed, and a delayed delivery/open event must not hide a bounce or suppression that prevents sign-in.
  **How to apply:** Preserve failures across later activity events, and do not infer that provider acceptance proves inbox delivery. Never use raw provider failure text or tracked URLs as diagnostic details: they can echo authentication secrets.
- Ambiguous Resend sends must stop automatic replay before the provider's 24-hour idempotency retention expires; a deliberate resend is a separate staff decision.
  **Why:** A lost response may hide an accepted email. Replaying its key after retention can send a duplicate, and changed content with the same key can be rejected.
  **How to apply:** Snapshot retry content, use bounded leases and a conservative retry window, and do not let an old queued invitation follow a deliberate resend or changed agreement.
