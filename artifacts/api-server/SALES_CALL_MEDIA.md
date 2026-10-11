# Internal sales call media API

This is an additive backend contract. Existing conversation/RPC/frontend contracts
are unchanged. No schema, provider settings, sends, or recording/transcription
creation are involved.

## Verification and limitations

Official GHL documentation, checked 2026-10-10:
- https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/conversations/get-message-recording/
- https://marketplace.gohighlevel.com/docs/ghl/conversations/get-message-transcription/
- https://marketplace.gohighlevel.com/docs/ghl/conversations/get-message/

The existing integration uses Version `2021-07-28`, not an implicit upgrade to v3.
Recording is documented as an audio/x-wav response from
`GET /conversations/messages/:messageId/locations/:locationId/recording`;
transcription is `GET /conversations/locations/:locationId/messages/:messageId/transcription`.
Messages require `conversations/message.readonly`; independent contact checks
require `contacts.readonly`. Recording/transcription additionally depend on the
provider's permission, phone service and actual existing media. The media docs
do not establish that every location has these capabilities.

Read-only checks used one conversation and at most twenty messages. Conversation,
message listing and single-message reads returned 200. Single-message response
was wrapped in `message` and included matching location/contact identifiers.
One existing call's recording request (Range: bytes=0-1; body cancelled) returned
422; its transcription request returned 400. These are deliberately reported as
`unavailable`, not proof of missing recordings, permissions, or transcription
enablement. No real audio was retained or played. Live successful playback remains
unverified; automated playback checks use synthetic bytes only.

No documented stable call-specific GHL UI permalink was verified. `ghlLink`
therefore honestly uses `level: "contact"` and the existing contact detail URL.
Do not label it “open this recording” or fabricate a call anchor.

## Routes and UI handoff

All routes require the current admin cookie, including every audio range request.
Use same-origin requests; never pass session tokens in the URL.

`GET /api/sales/leads/:leadId/calls/:activityId/details`

Only local IDs are accepted. The activity must be `provider_call` belonging to
that lead. Assigned active staff can read their lead; super admins may read assigned
team leads. Unassigned leads are denied for everyone. Provider contact and message
identities must independently match the configured location and local mapping.
No arbitrary remote ID, media URL or query parameters are accepted.

Example response:
```json
{
  "direction": "outbound",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "outcome": "completed",
  "durationSeconds": 12,
  "ghlLink": { "level": "contact", "url": "https://app.gohighlevel.com/v2/location/LOCATION/contacts/detail/CONTACT" },
  "recording": { "state": "not_checked", "playbackUrl": "/api/sales/leads/LEAD/calls/ACTIVITY/recording" },
  "transcript": { "state": "not_checked", "url": "/api/sales/leads/LEAD/calls/ACTIVITY/transcript" }
}
```

Metadata may be null; never infer an outcome, timestamp, duration or direction.
`not_checked` is not a claim that media exists. The recording URL is suitable for
an HTML audio element. Fetch transcript separately, on demand. If audio errors,
fetch the same recording URL to read its JSON error state (do not download on
every render). Render transcript as plain text, never HTML.

`GET /.../transcript`: `{ "state": "available", "segments": [
{ "text": "...", "startMs": 0, "endMs": 1000, "channel": 1 }] }`.
Timing/channel may be null; no AI transcript is generated. GHL's documented
single-segment object and arrays of those objects are supported. Unknown response
shapes fail explicitly rather than being interpreted as absent transcripts.

`GET|HEAD /.../recording`: audio response, 200 full or 206 single byte range.
Supports start/end, open-ended, suffix ranges and Safari's bytes=0-1 probe;
invalid/multiple/unsatisfiable ranges return 416 with `Content-Range: bytes */N`.
If-Range cannot match a local validator, so it returns full 200. HEAD returns the
same headers without bytes. No upstream cookies, redirects, validators, errors,
Content-Disposition, or private URLs are forwarded.

## Error states

All errors are JSON `{ state, explanation? }`:
- 401 `unauthorized`: sign in again (includes expired/idle/deactivated sessions).
- 404 `not_found`: local ownership/activity or remote identity mismatch; same
  generic response, with no call metadata.
- 404 `missing`: provider media endpoint returned 404 or an empty transcript/audio.
  This does not distinguish “never recorded” from removed media.
- 403 `permission_unavailable`: GHL 401/403; check integration/provider permissions.
  A provider token expiry maps here, not to the local sign-in state.
- 410 `expired`: explicit upstream 410 only; never infer expiry from a generic 403.
- 424 `unavailable`: GHL 400/422; provider rejected the request for unknown reasons.
- 502 `provider_failure`: network, timeout, unexpected data/status, or redirect.
- 413 `too_large`: portal media size limit; use the GHL contact fallback.
- 429 `rate_limited`: retry after 60 seconds.
- 400 `invalid_request`, 403 `forbidden`: invalid input or cross-site request.

All responses have private/no-store policy. Clear transcript/audio state on
sign-out or lead change. A loaded audio buffer cannot be recalled after access
revocation; subsequent requests always recheck live session and ownership.

## Security/resource boundaries

Only fixed HTTPS services.leadconnectorhq.com endpoints are requested. **All
redirects are rejected**, even same-host ones; no unverified CDN allowlist or
signed attachment fallback. Authorization goes only to that origin. Payload
URLs are never used; transcript URLs are stripped. No sensitive upstream error
details are logged. No recording or private URL is written to DB/disk/cache.

GHL does not document reliable ranges. Each recording request buffers at most
32 MiB ephemerally, then serves an accurate slice from the full representation.
This deliberately trades upstream bandwidth/latency for reliable seeking without
durable media storage. Four in-flight requests per server, 60 requests/minute per
admin per server, 30-second total deadline, 1 MiB JSON limit, 5,000 transcript
segments. A redirect-only or larger recording is unsupported, not silently proxied.
Limits are process-local, not a global distributed rate limiter.

Authorization uses one short pooled DB query, never a transaction held during
network requests and never nested pool borrowing. Existing authentication performs
its own sequential live session/profile checks. Tests mock DB and GHL completely.
