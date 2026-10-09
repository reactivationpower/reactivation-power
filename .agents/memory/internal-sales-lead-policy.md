---
name: Internal sales lead policy
description: User-selected internal provider-sales CRM, outreach, and GoHighLevel boundaries.
---
The internal sales dashboard includes all website inquiry sources, affiliate referrals, manual leads, and existing GoHighLevel leads. Our dashboard is the authoritative sales record; GoHighLevel is the synchronized messaging/telephony backbone.

**Why:** The user wants an internal tool for the team selling Patient Pipeline, not another patient follow-up queue for customer practices.

**How to apply:** Isolate internal provider-sales leads from customer-practice patient data and do not expose sales conversation context to affiliates.

The user wants aggressive 30-day unresponsive-lead follow-up: two touches per day for the first three business days, varied morning/lunch/late-day slots, Monday–Friday 9–5 Eastern for business follow-up. Texts additionally stay within 8 AM–8 PM in the contact's device-derived local timezone. Consent comes from the lead form checkbox; store consent and timezone locally and in GoHighLevel.

**Why:** These are explicit outreach requirements, including variability and contact-local quiet hours.

**How to apply:** Use named timezones with DST support and reconcile both timing rules. Do not assume historical imported contacts have consent or infer current timezone from a plain SMS reply.

Each logged sales call must have a disposition, notes carried forward, and a next follow-up where applicable. The Log Call control belongs immediately below dispositions. Team reply email notifications are individually configurable; automation is for unresponsive leads, not autonomous conversations with engaged prospects.

**Why:** The user prioritizes consistent staff follow-up and explicitly limited automation to avoid complexity.

**How to apply:** Replies/appointments/opt-outs should suppress pending automation; an explicit rejection must not be treated as permission to continue automated outreach.

Call opens the lead's GoHighLevel contact in a new tab. The user wants inbound texts, call outcomes, and available call recordings/transcriptions surfaced internally.

**Why:** This is a distinct internal sales-location integration, not permission to change the customer-practice Twilio no-recording policy.

**How to apply:** Retrieve existing available GoHighLevel media with appropriate permissions; do not silently enable new recording.

Read-only private-integration probes cannot prove SMS sending permission, sender/A2P readiness, or recording/transcription access. Distinguish API-verified reads from an administrator's provider-configuration confirmation.

**Why:** Contact/calendar writes in the existing helper do not establish every proposed capability; an unapproved real-contact send is not an acceptable permission test.

**How to apply:** Keep automation disabled until configuration and consent scope are deliberately reviewed. Use protected/authenticated provider media access rather than private signed URLs when direct retrieval is unverified.

The user selected Supabase's native scheduler for five-minute internal-sales wakeups and approved enabling its scheduling extensions, without publishing or enabling SMS.

**Why:** The user chose the existing database rather than another external scheduler.

**How to apply:** Keep the independent database wakeup, secure its bearer in Vault, and require a healthy published-worker wake before activating automation. Do not replace it with an in-process-only timer or another provider without approval.
