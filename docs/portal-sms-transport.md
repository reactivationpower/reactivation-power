# Internal sales portal SMS transport

## Provider contract and read-only verification

Verified official GHL documentation on 2026-10-10:

- [Send](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/conversations/send-a-new-message/):
  `POST /conversations/messages`, `conversations/message.write`, sub-account token.
  SMS uses contactId, message, fromNumber, toNumber and pending status.
  A returned messageId means acceptance, not delivery. No documented request
  idempotency key is assumed.
- [Messages](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/conversations/get-messages/):
  `conversations/message.readonly`; nested messages envelope; lastMessageId
  cursor and nextPage flag. Explicit messageType wins over numeric type.
- [Active numbers](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/phone-system/active-numbers/):
  `phonenumbers.read`; location-scoped active-number list. The pinned API version
  is still 2021-07-28; current v3 docs have a different response envelope.

Read-only probes returned HTTP 200 for active numbers and conversation search.
The location had exactly one active SMS-capable number. Neither those probes nor
an administrator's readiness confirmation proves message.write access, A2P
registration, carrier approval, or successful delivery. No send was performed,
no readiness flag enabled, no provider configuration changed.

## Sending and ownership

The existing super-admin readiness action now binds the single active sender
and location in sales_settings.capabilities.portal_sms_sender. An old true
sms_ready flag without this binding fails closed; an administrator must
deliberately reconfirm readiness before sending. Multiple numbers, changed
numbers, unavailable number-read permission or unknown response shapes block
dispatch rather than use an implicit provider default.

Local assignment and active confirmed staff, exact provider contact/location/
E.164 phone, provider contact assignment, conversation assignment, local and
provider opt-outs, documented consent and verified recipient-local 8 AM–8 PM
hours are checked. With no conversation, a verified assigned contact is allowed:
GHL creates the first conversation during send. Multiple conversations or
reassignment discrepancies require correction in GHL; the portal never changes
ownership or chooses an arbitrary thread.

Each request UUID binds author and unchanged content. The durable intent precedes
the provider call. Retrying that UUID returns saved state, without sending again.
Interrupted/ambiguous acceptance requires review; body/time similarity is never
used to link an uncertain send to a provider message. Existing worker recovery
marks abandoned sending intents uncertain.

## Read response (additive, no frontend change)

Existing lead/messages/readiness/contactUrl fields and call/appointment/email
history remain. Messages also expose source, source_id, provider_id, raw_status,
canonical_status and existing direction. source_id is the durable local row ID;
provider_id is the GHL message ID when known, otherwise null. raw_status is the
retained provider status (or local state before provider evidence); canonical
status maps queued/pending to accepted and undelivered to failed, retaining
sending, uncertain, sent, delivered, received and read. Unknown values stay
unknown. Accepted is never represented as carrier-delivered.

Terminal SMS evidence is sticky, including conflicting late terminal events.
This intentionally favors no regression over guessing which contradictory
event is newest without a trustworthy provider event timestamp.

Manual email is rejected at schema validation. readiness.email is false and
emailReason explains that history remains available. No receiving/email history
or automated appointment-email transport is removed.

Compatibility: the composer action still returns state=sent for provider
acceptance, matching the existing UI's acceptance banner and draft reset.
Its additive canonical_state=accepted and the persisted state=accepted remove
ambiguity for the downstream UI integration. Manual refresh throws a safe error
on throttled/unavailable results, so the current UI cannot toast false success.

## Refresh and limits

Opening and refreshing a conversation runs durable cross-instance refresh.
It fetches the contact and latest message page, then at most two history pages
(100 messages each). Cursors are scoped to the validated conversation; legacy
unscoped cursors restart safely. Every pass rereads the newest page; old pages
are revisited over successive bounded history sweeps. Delivery updates outside
the newest page are therefore eventually observed, not guaranteed within 30s.

A sales_jobs metadata row with state=done provides a two-minute crash lease;
successful refreshes throttle for 30 seconds, failures for 60 seconds, and 429s
honor at least 60 seconds or Retry-After. Shared provider cooldown is durable in
sales_settings. synchronization reports current, throttled or unavailable with
an explicit reason; saved history remains readable during provider outages.
“Current” means this bounded pass succeeded, not that all history was scanned.
The portal refresh does not require calendar or notes permissions and does not
postpone scheduled full reconciliation.

The main worker retains appointment work and contact sync ahead of maintenance;
maintenance uses the same refresh lease/cooldown. It processes at most five due
leads per pass. No additional pool or nested connection borrowing was added.
No schema migration is required: existing text state, cursor and JSON capability
fields are used. Fixtures use isolated schemas and mocked providers only.
