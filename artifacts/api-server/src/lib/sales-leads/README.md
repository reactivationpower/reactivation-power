# Internal provider-sales leads

## Independent wake schedule

The approved Supabase scheduler provides one named `pg_cron` job,
`patientpipeline-internal-sales-five-minute`, every five minutes. Provision with
`scripts/configure-sales-wake.ts` using the deployment-reported
`https://patientpipeline.app/api/cron/sales-leads` target. The existing `CRON_SECRET`
is encrypted in Supabase Vault; job text contains a Vault reference, never its
value. The `http` extension sends synchronously with a bounded four-minute
timeout, TLS verification, and a fifteen-second connection timeout. It consumes
authorization headers in memory, never placing them in `pg_net`'s request queue.
On this hosted database that queue is owned by `supabase_admin` with PUBLIC
permissions that our database role cannot revoke. The initially installed
`pg_net` extension is not used by this job. Do not switch this protected request
to it without verified queue protection. The route checks authorization before
any work. Only response status is selected, not headers/content.

Configuration does not publish or enable SMS. The job can be prepared while the
new endpoint awaits ordinary publication. Leads Settings shows this as pending,
not healthy. Only a successful authenticated native wake received by a production
instance with the active configured cron job establishes readiness.
Development/manual requests do not. Enabling automation requires a healthy wake
within ten minutes, and dispatch checks it again; stale evidence blocks sends
without a catch-up burst. Read-only GHL capability checks preserve scheduler
configuration/status. The existing protected five-minute `/api/cron/lead-emails`
trigger also runs the sales worker as a fallback.

This is separate from all customer-practice patient queues and their calling
connections. Only active admin/sales accounts can access it. Affiliates cannot
read these tables or call these RPCs. Supabase anonymous/authenticated roles
have no table permissions; RLS is enabled.

## Before enabling outreach

1. Set the default assignee to the verified active account for Jacob (the app
   deliberately cannot identify him from a first name or create an account).
2. Run read-only capabilities checks. Contacts, conversations, messages, notes
   and appointment access must pass. The existing private integration already
   writes contacts/notes/calendar events, but that does not prove SMS readiness.
3. Verify `conversations/message.write`, the location's SMS-enabled sender and
   A2P/consent configuration in GoHighLevel. Confirm this explicitly in Settings;
   that confirmation is labelled operator-confirmed, **not** a tested send.
4. Review overlapping GoHighLevel workflows. This feature does not change them.
5. Review/approve the saved SMS template, cadence preview and new-lead scope.
6. Explicitly enable. Only consented, timezone-verified website/affiliate
   submissions *created after that enable time* can enter the plan. Historical
   imports and manual entries remain manual-only. Manual follow-up scheduling
   pauses a sequence, never restarts it. DND, refusal, replies, appointments,
   wrong numbers and conversion stop it.

No real recipient has been used in automated tests. All send/claim/race tests
use isolated database schemas and mocked provider delivery. Disposable browser
fixtures use a server-only source marker that blocks external work entirely.

## API contracts and limitations

Existing private-integration `2021-07-28` contracts were probed read-only:
contacts list/detail, contact notes/appointments, conversation search/messages,
calendars and pipelines. Contacts pagination uses `meta.startAfter` and
`startAfterId`, never the returned URL. Message backfill uses `lastMessageId`.
Query-scoped imports require count/sample review, expire after 30 minutes, and
resume from a committed page cursor; repeated rows/submissions/events dedupe.
Phone/email disagreement creates a review, not an implicit merge. Shared phones
with different emails are not auto-merged. Original source/date, custom-field
answers and unnormalized phone values stay in submission context.

No supported private-integration webhook subscription was established. Instead
the durable worker claims five due **local** contacts per tick, revisits latest
messages for delivery updates, incrementally backfills older pages, and backs
off failures for 30 minutes. Normal per-contact revisit is 10 minutes; large
backlogs can be slower. Replies pause atomically when ingested; a fresh provider
reconciliation also runs immediately before each automated send. The open
dashboard polls **local** results every 20 seconds, not the provider account.
After a reviewed import, discovery scans one page of one approved query scope
per 10-minute slot, maintaining per-scope cursors/high-water marks. It does not
import every contact from the 5,702-contact location.

Shared contact fields, notes and stages are local-authoritative. Stage sync uses
the owned `pp-sales-stage:` tag namespace; other provider tags remain intact.
No existing opportunity pipeline, workflow or provider assignment is modified
without a separately reviewed mapping. DND=true is propagated; false is never
written. Provider notes have stable origin markers to avoid loops. Message
delivery facts never regress delivered/failed to queued/sent on old events.
Private attachment URLs and secret-bearing links are not retained.

Call opens the authenticated provider contact, not browser telephony. Existing
recordings/transcriptions are available via authenticated GoHighLevel deep
links to super admins. The provider displays pending, unavailable, expired or
missing-permission states. This feature neither enables recording nor
fabricates transcripts or exposes private media URLs.

## Durable scheduling

The production scheduler runs this worker every five minutes. For on-time work
on an autoscaling service that may be asleep, an existing external scheduler
must call `GET /api/cron/sales-leads` with the workspace cron authorization,
every five minutes. This task does not publish or configure a third-party cron.
Jobs, page cursors, leases, retry histories and touch reservations live in SQL;
claims use `FOR UPDATE SKIP LOCKED`, with per-lead advisory/row locks for final
eligibility and dispatch. Expired SMS/email/note dispatch claims become uncertain,
not automatically replayed. Note markers reconcile ambiguous note writes.
SMS acceptance that is uncertain still consumes a daily touch.

Quiet hours intersect M–F 9 AM–5 PM America/New_York with 8 AM–8 PM in the
verified contact IANA zone. Calendar days, weekends and DST are computed per
day; slots are distributed across the three calling windows. Missed SMS slots
older than five minutes are cancelled, not caught up in a burst. Calls and
outbound/provider SMS share the daily cap; reservation/message echoes dedupe
by provider ID. A plain reply never changes device timezone.
