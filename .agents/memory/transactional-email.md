---
name: Transactional email via Resend
description: Constraints learned wiring Resend sends, sender domains, and email delivery logging.
---
- The Resend connector key is send-only: `GET /domains` returns 401, so domain verification and open/click tracking can only be changed in the Resend dashboard by the owner. Probe a sender by POSTing to `/emails` with `delivered@resend.dev` (Resend's sink address) — a 403 names the unverified domain.
  Webhook management is also denied by the send-only credential. Prefer owner dashboard configuration to broadening the app's sending permissions.
  **Why:** The existing connection rejects webhook-list access; least-privilege sending should not be expanded merely to remove a status warning.
  **How to apply:** Give endpoint, event subscriptions, secure signing-secret placement, and published-event/inbox verification instructions when dashboard access is unavailable.
- `patientpipeline.app` was confirmed verified by the user and a successful Resend sink-send probe on 2026-10-02; use it for future senders (see outgoing-email-domain.md). Do not assume apex verification verifies subdomains. **Why:** sends from an unverified subdomain previously failed.
- Email logging is the drizzle `email_log` table in Supabase (moved from the Replit DB in Sept 2026). Resend webhook events match rows by `provider_id`.
- `sendEmail` must never throw: it is called inside payment confirmation and account provisioning where a mail failure must not roll back business writes.
- Tailwind `data-horizontal:` variant used by `components/ui/tabs.tsx` is not defined in the web app's CSS; put `flex flex-col` on `<Tabs>` explicitly or the tab panels lay out in a row and overflow.
- To e2e-test admin pages, create a temporary super admin through `auth.admin.createUser` with `app_metadata` role fields (run via a throwaway vitest file since tsx is not installed) and delete it afterwards.
- Once-per-event customer emails need an outbox row with a unique key (e.g. type + invoice) claimed *before* sending; checking `email_log` first is a read-then-send race (Stripe delivers `invoice.paid` and `subscription.updated` concurrently) and gives no retry path. Store the rendered template data on the row so a provider failure can be re-sent from the cron. **Why:** a code review rejected the log-lookup version for duplicates and silent loss.
- Treat a delivery failure as terminal for that individual email attempt; requesting a fresh email creates a separate attempt, not a repaired historical send.
  **Why:** webhook arrival order is not guaranteed, and a delayed delivery/open event must not hide a bounce or suppression that prevents sign-in.
  **How to apply:** Preserve failures across later activity events, and do not infer that provider acceptance proves inbox delivery. Never use raw provider failure text or tracked URLs as diagnostic details: they can echo authentication secrets.
- Verify incoming mail separately before configuring salesperson Reply-To addresses.
  **Why:** A domain can be verified for Resend sending and used for app logins without having a working receiving mailbox; these checks do not establish that replies reach a salesperson.
  **How to apply:** Check receiving DNS and have the operator confirm the inbox is monitored, then use an authorized reply test. Do not assume an app staff account's email is its working reply inbox.
- Ambiguous Resend sends must stop automatic replay before the provider's 24-hour idempotency retention expires; a deliberate resend is a separate staff decision.
  **Why:** A lost response may hide an accepted email. Replaying its key after retention can send a duplicate, and changed content with the same key can be rejected.
  **How to apply:** Snapshot retry content, use bounded leases and a conservative retry window, and do not let an old queued invitation follow a deliberate resend or changed agreement.
- Confirm public webhook errors against published application logs before diagnosing route absence.
  **Why:** A missing-secret rejection logged as HTTP 503 by the published server appeared as HTTP 500 through the public proxy.
  **How to apply:** Correlate a harmless unsigned probe with application logs; public status alone does not establish whether the route was reached.
