# Connect app-email delivery updates

## What was confirmed on October 12, 2026

- Replit deployment metadata identifies `https://patientpipeline.app` as the published autoscale server.
- A harmless unsigned empty request reached `/api/webhooks/resend`. Published server logs showed a 503 rejection because `RESEND_WEBHOOK_SECRET` is missing. The public proxy returned 500; that does not prove the application route is missing.
- Secure secret-presence inspection also reported the signing secret absent from production/shared Replit settings. No secret values were read or displayed.
- The existing Resend integration rejected webhook-list access: its key is restricted to sending emails. No webhook was created, changed, or verified.
- No sample was sent: the owner has not approved a test recipient or an inbox check.

Live tracking is **not verified**. The warning change is workspace code until the owner approves and publishes it.

## Owner setup checklist

1. Open **Webhooks** in the Resend account that sends Patient Pipeline account emails. Inspect any existing endpoint before creating a duplicate. Use `https://patientpipeline.app/api/webhooks/resend`.
2. Subscribe to `email.sent`, `email.delivered`, `email.bounced`, `email.suppressed`, `email.failed`, `email.complained`, `email.delivery_delayed`, `email.opened`, and `email.clicked`, where supported by Resend. Open/click events also depend on existing domain tracking settings; do not change sender domain or DNS.
3. Save the endpoint’s actual signing secret as `RESEND_WEBHOOK_SECRET` using secure Replit Secrets for the published API server. Never paste it into chat, source code, logs, or a non-secret form. A sending API key is not a webhook signing secret.
4. Approve publishing the code and secret configuration to the existing Replit deployment. Do not switch hosting or DNS. Workspace settings alone do not prove the running published server has the secret.
5. Approve one test inbox and arrange for its owner to check receipt. In **Admin → Emails → Account emails**, send one sample to that address only. Do not send a campaign or use the marketing recipient list.
6. In Resend, find that sample’s provider email ID and its genuine `email.delivered` event. Confirm its delivery attempt to the published endpoint receives HTTP 200. Match that exact provider ID to the existing `email_log.provider_id`, and confirm delivery status/timestamp and event evidence update on that row. If the webhook arrived before the log, let Resend retry; do not fabricate a delivery event.
7. Ask the approved recipient to check inbox and spam and confirm receipt. Record provider-event evidence separately from inbox confirmation. Provider acceptance is not delivery; recipient mail-server delivery is not guaranteed inbox placement.
8. Confirm a harmless unsigned request is still rejected without a log update. Never send fabricated bounce/failure events to production. Existing regression tests cover signatures, terminal-failure preservation, authorization, and privacy.

Dashboard setup is sufficient; do not broaden the sending integration’s permissions merely to remove the warning. If agent-managed configuration is desired, the owner must explicitly approve the required provider access and publishing first.

## Marketing templates are separate

The Resend warning applies only to app-sent account emails. It does not prevent marketing downloads or track campaigns sent from GoHighLevel.

In **Admin → Emails**, choose **Download every sequence — 68 emails (.zip)**. Unzip it and open `START-HERE.html` for subjects, timing, and import guidance; `emails.csv` is the companion index. Import each HTML file into the GoHighLevel HTML/code email editor (or use **Marketing sequences → Copy Code**). Keep the approved CTA/tracking links and merge tags unchanged. Existing imported templates do not update automatically.

Send a GoHighLevel test to an owner-approved inbox before starting any campaign. Check its layout, first-name merge tag, images, and approved links. GoHighLevel delivery and campaign reports remain separate from the Patient Pipeline Resend log. Downloading or importing starts no campaign.
