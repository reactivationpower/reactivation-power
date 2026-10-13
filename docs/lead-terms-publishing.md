# Marketing lead Terms of Service

Beyond Healthcare LLC is the legal company. Patient Pipeline is the product.
This feature records lead-form acceptance, not a signed customer service agreement
or texting/calling permission. Submitted identities are **unverified**.
It does not gate direct demo URLs, demo login, or training videos.

## Initial state

The migration creates empty settings only. No legal terms or acceptance records
are seeded. Until the first real document is published, forms work without a
Terms checkbox. A database/configuration failure is not treated as inactivity:
forms block submission and show a retry option.

## Publish the attorney's first document

Before publishing, merge and roll out the terms-aware frontend and API to **all**
serving hosts. Development and production share Supabase: publishing from any
host changes the same global current-version pointer. Do not activate while an
older server that lacks acceptance checks is still serving public submissions.

1. Sign in as a super administrator.
2. Open **Leads → Settings → Manage terms** (`/admin/leads/terms`).
3. Paste the complete attorney-provided text and enter an identified version label.
   Do not use sample or placeholder text. The editor accepts plain text, preserving
   paragraph breaks and indentation. HTML is shown literally, not executed.
4. Review the readable preview, save the draft, and review the saved version.
5. Choose **Publish**, confirm it is the attorney-provided document, and confirm
   publication. Publishing immediately activates required acceptance on every
   shared public marketing lead form, including popup, calculator, and scheduling
   forms. No email or direct-demo access gate is added.

Only super administrators can save drafts or publish. Concurrent draft edits
require reloading rather than overwriting someone else's changes. Publication
records the acting administrator and server publication time. The checkbox
disclosure is archived with the published document. Published content is plain
UTF-8 text with CRLF normalized to LF and outer whitespace trimmed; SHA-256
fingerprints these canonical bytes.

## Later changes

Paste the new attorney-approved document into the draft, use a new label, preview,
save, and explicitly publish again. This creates a new immutable version and
atomically updates the current pointer; it never edits earlier published text.
Existing version-specific `/terms/<version-id>` links remain readable.
There is no deactivation or version-edit API.

Visitors with an older version must review the current document and check again.
Names, contact fields, service choices, calculator entries, and independent SMS
permission remain filled in. There is no automatic reacceptance for existing
customers or historical, provider-imported, or manually entered leads.

## Review and export

The lead detail page shows **Terms acceptance history**. Each record contains the
frozen submitted name/contact/practice, server acceptance timestamp, source page,
version, document fingerprint, exact checkbox wording, IP and browser evidence,
and canonical sales submission/lead IDs. **Download evidence** creates an
authenticated JSON export including the exact archived terms. Any active
administrator may review/export; public users cannot retrieve acceptance records.
Contact edits do not alter evidence. Database triggers block update, delete, and
truncate of published documents and acceptances; restrictive foreign keys prevent
contact/submission deletion from cascading through legal evidence.

IP is taken from the server request using the app's configured proxy policy;
browser evidence is request-supplied and bounded. Neither proves identity.
For any future hosting/proxy change, review proxy trust before relying on IP
attribution. The export does not claim legal enforceability or verified identity.

## Intake and retry safety

The authoritative check holds a shared lock on the current-version settings row
inside the canonical sales intake transaction. Publication obtains an exclusive
lock on that same row. Acceptance and sales submission commit together, or neither
does. The evidence timestamp is database-owned, not a browser clock.

A per-mounted-form UUID plus displayed version identifies retries. Repeated saves
for that key reuse the canonical submission and its saved calendar reference;
changed identity under a reused key is rejected. A newly accepted version uses a
different key. The private calendar reference is retained in the submission
context for recovery after a lost response; it is never part of public terms
metadata or evidence downloads.

The existing earlier `landing_leads` write remains outside canonical intake.
An early terms check avoids that write for ordinary validation failures. If the
authoritative check/evidence transaction subsequently fails, the action removes
only its own legacy row, best effort, and returns no successful calendar handoff.
If legacy cleanup itself fails, an orphan legacy row may remain, but it is not
acceptance evidence and must not be interpreted as such.

## Validation safety

Database tests create run-specific disposable schemas, apply the additive DDL
there, and drop them afterward. They never activate fixture documents in the
shared `public` schema. Provider dispatch/mail are mocked. Browser checks may
intercept responses to exercise active states without publishing test content.
Never use schema push or sample publication against the shared live database.
