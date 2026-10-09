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
