---
name: Internal sales lead policy
description: User-selected internal provider-sales CRM, outreach, and GoHighLevel boundaries.
---
The internal sales dashboard includes all website inquiry sources, affiliate referrals, manual leads, and existing GoHighLevel leads. Our dashboard is the authoritative sales record; GoHighLevel is the synchronized messaging/telephony backbone.

**Why:** The user wants an internal tool for the team selling Patient Pipeline, not another patient follow-up queue for customer practices.

**How to apply:** Isolate internal provider-sales leads from customer-practice patient data and do not expose sales conversation context to affiliates.

The lead page needs one conversation panel combining automated appointment emails sent through Resend, two-way texting through the existing GoHighLevel sub-account/number, and GHL call history. The user does not need a manual email composer or incoming email in the portal.

**Why:** The user clarified that they are turning off GHL appointment-reminder automations. They want branded automated emails visible on the contact, not a full email inbox.

**How to apply:** Resend sends appointment notifications/confirmations, reminders, reschedules, and cancellations with Patient Pipeline branding/logo. Display these sent emails in the lead's timeline. GHL provides portal SMS sending/receiving and provider-reported sending/delivery/failure statuses. Include GHL calls, recording playback and transcripts where available, and a link to view in GHL. Do not require Resend receiving or token reply addresses. Keep email Reply-To directed to the configured external staff mailbox.

The user wants aggressive 30-day unresponsive-lead follow-up: two touches per day for the first three business days, varied morning/lunch/late-day slots, Monday–Friday 9–5 Eastern for business follow-up. Texts additionally stay within 8 AM–8 PM in the contact's device-derived local timezone. Consent comes from the lead form checkbox; store consent and timezone locally and in GoHighLevel.

**Why:** These are explicit outreach requirements, including variability and contact-local quiet hours.

**How to apply:** Use named timezones with DST support and reconcile both timing rules. Do not assume historical imported contacts have consent or infer current timezone from a plain SMS reply.

Each logged sales call must have a disposition, notes carried forward, and a next follow-up where applicable. The Log Call control belongs immediately below dispositions. Team reply email notifications are individually configurable; automation is for unresponsive leads, not autonomous conversations with engaged prospects.

**Why:** The user prioritizes consistent staff follow-up and explicitly limited automation to avoid complexity.

**How to apply:** Replies/appointments/opt-outs should suppress pending automation; an explicit rejection must not be treated as permission to continue automated outreach.

Call opens the lead's GoHighLevel contact in a new tab. The user wants inbound texts, call outcomes, and available call recordings/transcriptions surfaced internally.

**Why:** This is a distinct internal sales-location integration, not permission to change the customer-practice Twilio no-recording policy.

**How to apply:** Retrieve existing available GoHighLevel media with appropriate permissions; do not silently enable new recording.

For internal call media, fail closed on provider redirects and use the contact-level GHL link unless a stable call permalink is independently verified. An undocumented media error must not be labeled “not recorded” or “expired.”

**Why:** GHL documents direct audio retrieval but not reliable range semantics or a stable call UI permalink. Read-only sampling established message identity checks, not successful media availability. Broadening to attachment/CDN URLs would introduce a new credential and SSRF boundary.

**How to apply:** Keep playback bounded and ephemeral without persisting private media URLs; any future redirect/CDN support needs explicit host, redirect, credential-isolation and range verification.

Read-only private-integration probes cannot prove SMS sending permission, sender/A2P readiness, or recording/transcription access. Distinguish API-verified reads from an administrator's provider-configuration confirmation.

**Why:** Contact/calendar writes in the existing helper do not establish every proposed capability; an unapproved real-contact send is not an acceptable permission test.

**How to apply:** Keep automation disabled until configuration and consent scope are deliberately reviewed. Use protected/authenticated provider media access rather than private signed URLs when direct retrieval is unverified.

The user selected Supabase's native scheduler for five-minute internal-sales wakeups and approved enabling its scheduling extensions, without publishing or enabling SMS.

**Why:** The user chose the existing database rather than another external scheduler.

**How to apply:** Keep the independent database wakeup, secure its bearer in Vault, and require a healthy published-worker wake before activating automation. Do not replace it with an in-process-only timer or another provider without approval.


Manual staff texts may be sent from preview (same DB and GHL account as production) and must not require the GHL contact/conversation to be assigned to the salesperson; the user found those gates needlessly complicated ("You just need to fix it for us"). The sender profile falls back to the sender's own or the only active host.

**Why:** The user wants to text leads directly from the portal without extra setup steps.

**How to apply:** Keep consent, opt-out/DND, 8 AM–8 PM, phone identity, sender binding (one Settings checkbox) and no-blind-resend. Automatic texts/emails stay off unless deliberately enabled. Contact info on the lead page is read-only with an Edit button, not always-editable fields.

Strategy-call reminders go by both email and text at booking, 1 day, 12 hours, 2 hours and ~5 minutes before. Automatic reminder texts also do not require GHL conversation assignment and must not reassign the GHL contact owner.

**Why:** The owner asked for this reminder set and the same no-assignment simplicity as manual texts.

**How to apply:** Night texts wait for 8 AM only if still before the next reminder; short-notice bookings get only the booking message and the 5-minute "starting" message, which is never held back by text spacing.

New sales leads go to the configured default assignee, which must be a verified, active staff account (never a deactivated duplicate). Existing leads are not reassigned when the default changes.

**Why:** Owner request.
