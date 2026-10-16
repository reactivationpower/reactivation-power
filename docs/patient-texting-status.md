# Patient texting implementation status

## Implemented and exercised

- Owner-only office handling, separate after-hours switch, timezone, weekly hours, closures, and provider-path preference.
- Authenticated, practice-scoped simulation using the existing fictional Melissa Tran lead in Ridgeline Chiropractic. No reseed or writes to calls/campaigns/analytics.
- Durable simulation transcript, unique practice/phone conversation, ordered messages, deduplicated commands, handoff, staff takeover, simulated clock, one reminder, STOP, reset.
- Row locks and revision checks discard model replies after takeover/reset. Simulated delivery has no SMS transport.
- Dedicated authorized demo key; pinned OpenAI model; bounded input/output; durable shared $1 reservation ledger, including failed/uncertain attempts. Reset does not restore budget.
- Ten generated replies and eleven patient turns saved, plus office-opening transition and takeover.
- Policy unit tests and API/web type checks pass.
- App/API workflows restart cleanly and the public page renders. This does not verify the signed-in screens.
- Initial full validation exposed stale notification/appointment test fixtures and a legacy sales-email drain regression in the current tree. The legacy drain was restored with reply-notification/outreach-suppression coverage, and targeted failing tests now pass. Final full validation runs through task completion.

## Additional implementation

- Separate production recipient/thread/message/intent records now exist, with explicit consent evidence, timezone, irreversible staff-recorded STOP, and an internal-note-only portal view. New webhook leads are recorded as blocked when office automation was requested; no historical lead migration occurs.
- Office-owned credentials can be stored/revoked by owners only, encrypted with AES-GCM and tenant/kind-bound authenticated data. The encryption key is purpose-derived from the server session secret. Rotation requires revocation/reconnection; no plaintext readback exists.
- Call claims share the recipient lock, cancel pending text intents, and reject simultaneous calls to the same recipient in another campaign.
- Disabled direct-office GHL and independent-provider send adapters, GHL Ed25519/Twilio SDK signature validation, and durable inbound replay/suppression logic exist. No environment toggle activates messaging.
- The authenticated `/api/cron/patient-texting` endpoint reconciles pending intents under shared recipient locks without sending. It uses durable rows rather than reminder timers.
- Isolated-schema tests exercise replay, tenant isolation, call cancellation, takeover races, STOP, reminders, budget and reset behavior. Mock provider/model responses are explicitly identified as fixtures.

## Capabilities still blocked — not production-ready

- Provider account ownership, direct billing, numbers/registration, GHL contact mapping/scopes, and authenticated production callback commissioning have not been verified. The UI never marks stored credentials as ready.
- Callback routes reject uncommissioned events instead of acknowledging them. GHL office contact mapping and live delivery receipt reconciliation are not commissioned; unknown provider results are never automatically resent.
- Office-owned production AI access is stored separately but is not activated. Only the explicitly authorized fictional-demo model key is used.
- No live scheduler is enabled for sending. Provider/compliance/consent commissioning and a separately authorized opt-in pilot are necessary before any live activation.
- Authenticated browser testing reached the owner settings and found a transcript timestamp-formatting exception. The Intl options were corrected and covered by a rendering regression test; no further model calls were made.
- Model prompt/output guardrails are a simulation aid, not a clinical safety or privacy approval.

Do not publish or activate patient texting based on this simulation.

## Evidence

Transcript inspection in the Ridgeline demo:

`/portal/campaigns/ffa4b75c-339f-4190-a6e7-d06aab104cba/leads/21a27f67-04ad-4a57-aa75-1470cff5c038`

The local generated-artifacts/patient-texting directory contains the actual JSON run and its prior version. Generated files are excluded from Git/deployment. Durable replay/review uses the simulation table. The run starts at a synthetic Saturday instant; original source timestamps remain untouched.

The $1 authorization currently has $0.80 reserved, not a claim of $0.80 invoiced. Initial calls reserved 5 cents each; later calls reserve 2 cents each. Each later request has at most 30,000 UTF-8 input bytes plus bounded framing and 400 output tokens, costing less than $0.014 at the documented pinned GPT-4.1-mini rate ($0.40/M input, $1.60/M output). No retries happen automatically.

## Provider documentation checked

- https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/ — current Ed25519 X-GHL-Signature; exact body validation and marketplace configuration.
- https://www.twilio.com/docs/usage/webhooks/webhooks-security — account-specific signature and canonical external URL validation via SDK.
- https://developers.openai.com/api/docs/models/gpt-4.1-mini — model availability, structured output, and token pricing.

These are documentation checks, not live provider tests. No real SMS, enrollment messages, purchases, account provisioning, or production patient-model transfers were performed.
