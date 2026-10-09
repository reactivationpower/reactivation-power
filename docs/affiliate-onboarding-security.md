# Affiliate payment onboarding operations

## Boundaries

This feature receives U.S. contact details, domestic wire instructions and a completed signed W-9. Receipt and admin review do **not** establish identity, bank ownership, wire eligibility, signature validity, IRS validation, or tax compliance. Verify instructions independently before an external monthly wire. It does not send transfers or alter commissions.

Contact, wire instructions and the bounded W-9 content are AES-256-GCM encrypted before persistence. The requested affiliate-linked encrypted-content migration stores the W-9 ciphertext alongside the intake, so replacements and version checks commit atomically; no plaintext PDF is placed in public file storage. The maximum PDF is 2 MiB and 20 pages. Each field is bound to its affiliate and field name as authenticated additional data. Public and authenticated Supabase client roles have no access; the server database role alone reads these tables.

Only inbox-verified approved affiliates may submit their own intake. Replacing bank details or W-9 requires verification within 15 minutes. Every save clears review and increments a version. Admin review, wire reveal and W-9 download are super-admin-only, same-origin, rate-limited and version-checked; the audit records the action/version, not the values. The browser holds intake only in memory; API responses use no-store. Revealed wire data is hidden automatically after a minute.

PDF checks reject malformed, encrypted and active-content PDFs, including compressed dictionary actions. They are not malware scanning or tax-document validation. Downloads are deliberately initiated, named signed-w9.pdf, and provided as attachments rather than inline previews. Treat any downloaded third-party document as untrusted.

## Keys and rotation

- Keep AFFILIATE_DATA_KEY_V1 (64 hexadecimal characters encoding 32 random bytes) in server secrets, never source, a NEXT_PUBLIC/VITE variable, client code, logs, screenshots or email.
- AFFILIATE_DATA_KEY_VERSION defaults to V1. A future rotation sets it to V2 and provides a separate AFFILIATE_DATA_KEY_V2 through secrets tooling. Old keys must remain available until every old ciphertext and retained backup has been accounted for.
- Back up keys separately from database backups with access limited to authorized operators. Loss of a key makes its encrypted records unrecoverable. Restoring a database backup also requires its key versions.
- First test rotation with synthetic records in an isolated schema. Set up the new key, switch the active version, then re-encrypt each contact/wire/W-9 with unseal/seal under a row lock and one transaction per affiliate. Preserve version, submission/review state and commissions. Verify decryptability before committing, and log counts only. A interrupted batch can resume by checking the version prefix.
- Do not retire an old key merely because current rows use the new key: retention and disaster-recovery copies may still need it. If a key was exposed, revoke affiliate sessions/entry links as appropriate, rotate, and follow the organization's incident process.

## Retention

Only the current intake is held in the live intake table; replacing it overwrites the prior ciphertext. Database backups may retain older copies. No automatic deletion of tax documents is introduced: the business must establish its retention/legal-hold policy with its tax/legal advisors before a purge schedule is enabled. Approved operator deletion must be affiliate-scoped, separately authorized and audited with an identifier/count only; preserve commission and payout history. Apply the same policy to backups and any admin downloads. Never include decrypted data in support tickets or diagnostic dumps.

## Invitation delivery

No existing affiliate receives an automatic migration backfill. A new approved affiliate or a pending affiliate's first approval queues a unique initial event in the save transaction. Delivery occurs afterwards. Ordinary edits cannot queue another initial invitation. Admin resend is deliberate and creates a separate event.

Recipient, entry link, and business name are snapshotted at enqueue; rendered content and sender are frozen before the first provider request. Each event uses one provider idempotency key. Row-lock claims and a five-minute lease prevent concurrent ordinary claims. At most five attempts are made, ten minutes apart; ambiguous delivery is not retried after 23 hours, safely within Resend's 24-hour idempotency retention. An operator must inspect provider evidence before explicitly resending an uncertain job.

The existing five-minute scheduler and protected /api/cron/lead-emails and /api/cron/sales-leads wakeups drain due invitations, sequentially and in bounded batches. No new pool is created. Sleeping deployments still need an existing external wakeup. Provider acceptance is not inbox delivery: the profile shows email_log delivery events only when the existing signed Resend webhook has received them.

Email/status/access-version changes cancel queued events. A request already in flight may still reach Resend, but the obsolete entry link cannot authorize access; all verification/session checks use the current version/status. Invitations themselves do not prove inbox ownership. They lead to an additional single-use inbox-verification email. Neither email contains bank or W-9 content.

## Deployment

Apply the additive 0033_affiliate_secure_intake migration before activating the new code. Never use schema push. Configure the encryption key independently on every server host that serves this app; production hosting is not published by this task. Verify effective grants for anon/authenticated and that the cron wakeup and signed Resend webhook remain configured. A missing/invalid key fails closed.
