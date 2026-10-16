# Conversation launch checklist

Checked October 10, 2026 (America/New_York; evidence collected after 01:00 UTC October 11).

## Bottom line

**Do not turn messaging on yet.** The software can be tested safely, but real
email delivery, mailbox replies, text delivery, and real call playback still need
checks. No prospect was contacted. No channel was enabled. Nothing was published.

## Before a real test

- [ ] Fix/verify the external Reply-To mailbox. `patientpipeline.app` currently
  returns no MX records. Replies to `jacobb@patientpipeline.app` are not proven
  receivable. DNS and mailbox changes need separate permission.
- [ ] Verify Resend sender approval and outgoing delivery callbacks.
  `RESEND_WEBHOOK_SECRET` is absent from the production environment inspected.
  The existing Resend connection returned HTTP 401 for read-only domain and
  webhook inspection. Appropriate access in that existing connection is needed;
  this check did not replace credentials or change Resend.
- [ ] Review existing GoHighLevel reminders to avoid duplicate messages.
  Its API lists five workflows, but a workflow list does **not** establish their
  triggers, timing, calendar notifications, or whether they overlap.
- [ ] Name and explicitly authorize a test recipient and test booking.
  No recipient was selected by this task.
- [ ] Explicitly approve publishing the tested code. The currently published
  site is public and has a successful build, but that is not proof it contains
  these changes.

## Turn on each channel separately, only with permission

| Channel | Current state | What still needs proof |
|---|---|---|
| Manual portal texts | Off; sender not bound | Confirm the existing number, GHL write permissions, carrier/A2P approval, consent, timezone and staff ownership. Then test acceptance, delivery, reply and opt-out with the authorized recipient. |
| Automatic appointment email | Off | Working Reply-To mailbox, verified sender, signed outgoing delivery callbacks, no overlapping GHL reminders, host/meeting link, and an authorized new test booking. Test confirmation, reminder, reschedule and cancellation. |
| Automatic appointment texts | Off | Separate approval and channel-specific provider/sender checks. Manual texting readiness or email approval must not be treated as automatic SMS approval. |

After each authorized test, check the recipient's actual inbox/phone and the
provider evidence. “Accepted” is not “delivered.” A simulated delivery result is
not a live delivery result. Do not enroll historical bookings.

## Confirmed without sending

- GHL number lookup: HTTP 200, one SMS-capable number in the configured location.
  This proves read access, not permission to send or carrier approval.
- GHL conversation and calendar reads: HTTP 200.
- One active appointment host record exists; this is not an attestation that its
  account, reply mailbox and meeting link are ready.
- The scheduler's saved check was verified at 01:00:02 UTC. Published logs show
  successful five-minute `/api/cron/sales-leads` requests through 01:00 UTC.
  This proves recent wakeups, not successful future appointment delivery.
- Sender configuration is `Patient Pipeline <team@patientpipeline.app>`.
  Email history uses the frozen content and sender from the send attempt,
  rather than rebuilding old mail from today's template.
- The outgoing webhook rejects bad signatures and ignores incoming email.
  Provider-side receiving-webhook disablement could not be independently
  rechecked with the available Resend access. No receiving setup was recreated.
- No saved provider call was available for a real media capability check.
  Recording/transcription permission and real audio remain unverified.

## Checks and evidence

See the verification results below for the automated and browser checks.
Browser message/media fixtures are synthetic; authentication is real and
disposable. Server tests mock outbound providers and isolate database fixtures.

### Verification results

- Workspace typecheck passed; the changed frontend also passed its subsequent
  typecheck. Configured full test workflow finished; completion validation
  reruns the configured checks against the final tree.
- Flow lint: 41 files, zero errors, 40 existing warnings.
- Focused conversation/ownership/media checks: 3 server files, 59 tests passed.
- Appointment worker/history/outgoing webhook checks: 3 files, 35 tests passed.
  These cover overlapping wakes, committed-send crash recovery, uncertain-send
  non-replay, duplicate reconciliation, rapid reschedules, cancellation with
  missing metadata, expired reminders, provider opt-out/ownership, independent
  SMS activation, frozen history and signed status-event ordering.
- Updated frontend conversation checks: 11 tests passed, including the external
  reply warning and refreshing lead context after sending a text.
- One protected desktop/390px mobile browser pass passed. Real disposable admin
  and salesperson sign-ins; synthetic timeline/email/SMS/call responses.
  Verified filters, safe email iframe, SMS length/acceptance/delivery/uncertainty,
  advancing generated WAV playback, transcript and unavailable-media warnings,
  mobile navigation and cached-content removal after simulated access loss.
- Unmocked salesperson requests for nonexistent conversation/media IDs returned
  403/404. Cross-assignee isolation is proven separately by the server fixtures,
  not by the browser's simulated revoked-access response.
- Both disposable users were signed out and deleted, then checked as absent.
  No public lead or appointment fixture was created. Temporary credentials and
  helper scripts were removed. Browser sends were intercepted and never reached
  the server/provider. Isolated backend tests used mocked providers.

Browser evidence: `generated-artifacts/conversation-readiness/REPORT.md` and
`SCREENSHOT-INDEX.md` (ignored generated outputs). One synthetic non-UUID lead
caused an unrelated Marketing Activity validation error; that panel was not
claimed as verified. Sandbox/CSP warnings were expected for blocked email scripts.

The UI explicitly says that email replies are read in the external mailbox.
**An external email reply does not automatically stop portal outreach.**
Staff must update the lead before further contact. Legacy inbound-helper tests
do not mean the receiving webhook is active.

### Database safety

`drizzle-kit check` passed. All 38 migration journal entries have unique tags and
ordered timestamps. The conversation migrations' SQL hashes match the recorded
migrations, and the required history/inbox columns exist. No migration is above
the database migration high-water mark. No migration or schema push was run.
The supported post-merge script still uses reviewed migrations, not schema push.

One **older patient-campaign migration** (`0009_busy_shiver_man`) has a recorded
timestamp but a different SQL hash. Its `source_submitted_at` column exists.
This does not prove its historical data backfill is identical. Do not replay it,
rewrite the ledger, or bulk-update old patient records as a conversation fix.
Investigate the original applied SQL separately before any database rebuild.

The read-only evidence script uses one database connection and a read-only
transaction. The normal test configuration limits database test workers and
pools; no shared-database load test was performed.

Recheck nonsecret facts with:

```sh
node artifacts/api-server/scripts/conversation-readiness.mjs
```

The script performs GET requests only, does not invoke a scheduler or provider
write, and prints aggregates rather than prospect data, provider IDs or tokens.
