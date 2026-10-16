# Appointment email integration contract

`listAppointmentEmailHistory(leadId, limit=200)` in
`artifacts/api-server/src/lib/appointment-messages/history.ts` is server-only.
It authenticates the current admin and scopes both queries to super admins or
the lead's assigned salesperson. Do not call it inside a checked-out database
transaction. No additional RPC has been registered; integrate it into the
authorized conversation action.

Returns `{ messages, hasMore }`, newest first, stable ordering by attempted time
and delivery ID. Limit is 1–200. Only attempted/frozen email deliveries appear;
scheduled reminders are not presented as sent mail. Replace the existing
appointment-email projection rather than appending it and creating duplicates.
Keep the existing appointment-SMS projection separately.

Each message has:
- `id`, `source: "appointment"`, `sourceId`, `appointmentId`, `kind`,
  `channel: "email"`, `direction: "outbound"`.
- Frozen `subject`, `html`, plain-text `body`, `recipient`, `from`, `replyTo`,
  `authorName`, `contentAvailable`. Missing historical content stays null;
  never regenerate it or substitute the contact's current address.
- `status`: `accepted` means Resend accepted the request, **not delivered**;
  `delivered` requires recorded delivery evidence; `failed`, `uncertain`,
  `sending`, and `not_sent` remain distinct.
- Raw `dispatchState`, `providerStatus`, `providerId`, `emailLogId`.
- ISO/null `attemptedAt`, `sentAt`, `deliveredAt`, `openedAt`, `clickedAt`;
  `createdAt` supplies a stable timeline time. `sentAt` is null without positive
  acceptance evidence. An uncertain send must not be labeled failed merely
  because an accompanying transport-error log says failed.

Render HTML only inside a sandboxed, script-disabled email preview, not directly
inside the app DOM. Apply the app's HTML sanitization and link protections.
Keep delivery errors generic and never display provider URLs or credentials.

## Activation contract

`saveAppointmentMessaging({ enabled, confirmReadiness, smsEnabled? })` defaults
`smsEnabled` to false. Email approval does not approve automatic appointment
texts or manual inbox texting. `getAppointmentMessaging().config.sms_enabled`
reports automatic-text approval. Explicitly selecting true requires readiness
confirmation when not already approved. The flag uses the existing
`sales_settings.capabilities.appointment_sms` JSON object; no migration is needed.
Settings changes share the appointment worker lock. Existing cadence remains
confirmation, 24-hour email/SMS and final 30-minute SMS, with SMS slots created
only when separately enabled. Do not activate either channel during integration.

## Delivery and readiness

The existing signed `/api/webhooks/resend` handler processes outbound delivery
events. `email.received` is ignored and no receiving key or receiving-domain
configuration is needed. Outbound webhook signing/subscription is a separate
production prerequisite; without it display acceptance only.

Reply-To remains `jacobb@patientpipeline.app`; verify externally that this mailbox
receives replies. Replies do not enter this portal or automatically stop its
outreach. Before authorized activation, verify the sender and public logo,
published scheduler, matching GHL host/contact/calendar, and that duplicate GHL
appointment workflows have actually been disabled. A missing Meet link blocks
non-cancellation email; expired reminder windows are skipped, not backfilled.

All automated verification uses synthetic identities and mocked providers. No
production message, mailbox/DNS change, webhook subscription change, historical
enrollment or activation was performed. The downstream integration task owns
lead-page UI and the final readiness task owns the combined verification.

## Verification handoff

The 72 focused tests across appointment lifecycle/history, shared mail,
Resend callbacks and booking connection reuse pass, as does the API typecheck.
The API restarts cleanly with development scheduling disabled and the public
page renders. The protected conversation UI is intentionally left to integration.

The earlier full-suite workflow has a separate sales-worker fixture failure:
`src/lib/sales-leads/store.test.ts` does not create `sales_inbox_messages`
although the main worker now accesses it. That fixture belongs to the parallel
texting/worker work; final integration must check its merged fix. The other
earlier booking-pool failures were fixed here by including disabled appointment
settings in that test's mock, and the focused booking tests now pass.
