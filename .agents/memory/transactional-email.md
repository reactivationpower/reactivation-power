---
name: Transactional email via Resend
description: Constraints learned wiring Resend sends, sender domains, and email delivery logging.
---
- The Resend connector key is send-only: `GET /domains` returns 401, so domain verification and open/click tracking can only be changed in the Resend dashboard by the owner. Probe a sender by POSTing to `/emails` with `delivered@resend.dev` (Resend's sink address) — a 403 names the unverified domain.
- Only the apex `reactivationpower.com` was verified as of Sept 2026; the requested `links.reactivationpower.com` was not. Code default stays the requested address, `RESEND_FROM` env overrides until verification. **Why:** the owner explicitly wants the `links.` sender; the override keeps invites working meanwhile.
- Email logging lives in Replit Postgres (drizzle `email_log`), not Supabase — no DDL there. Resend webhook events match rows by `provider_id`.
- `sendEmail` must never throw: it is called inside payment confirmation and account provisioning where a mail failure must not roll back business writes.
- Tailwind `data-horizontal:` variant used by `components/ui/tabs.tsx` is not defined in the web app's CSS; put `flex flex-col` on `<Tabs>` explicitly or the tab panels lay out in a row and overflow.
- To e2e-test admin pages, create a temporary super admin through `auth.admin.createUser` with `app_metadata` role fields (run via a throwaway vitest file since tsx is not installed) and delete it afterwards.
- Once-per-event customer emails need an outbox row with a unique key (e.g. type + invoice) claimed *before* sending; checking `email_log` first is a read-then-send race (Stripe delivers `invoice.paid` and `subscription.updated` concurrently) and gives no retry path. Store the rendered template data on the row so a provider failure can be re-sent from the cron. **Why:** a code review rejected the log-lookup version for duplicates and silent loss.
