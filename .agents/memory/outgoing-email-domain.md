---
name: Outgoing email domain
description: Standing rule for links in future Patient Pipeline emails, including old queued messages.
---

The user requires: “In any email that ever gets sent moving forward, I need to make sure that the email link is coming from patientpipeline.app and not reactivationpower.com.”

**Why:** The user explicitly requested this for every future email, not just the marketing sequences.

**How to apply:** Use https://patientpipeline.app for app-owned email links and logo links, including retries of previously saved email payloads. Preserve token paths and query strings, third-party payment receipt URLs, customer email addresses, and historical agreement wording. Do not treat a website-link change as permission to alter signed documents.

The user subsequently confirmed patientpipeline.app DNS verification in Resend on 2026-10-02, and a new connector probe to the Resend sink address succeeded (HTTP 200). The approved sender is Patient Pipeline <team@patientpipeline.app>. Use only this domain for future sender addresses; do not silently fall back to the old domain on delivery failure.

**Why:** The website domain and mail-sending domain are verified separately. An earlier probe failed before verification; successful provider acceptance established that the sender switch was safe.

The user requires replacing support@reactivationpower.com everywhere it occurs with team@patientpipeline.app, including agreement support contact text.

**Why:** The user noticed the obsolete address while reviewing an agreement and explicitly requested the replacement.

**How to apply:** Use the replacement throughout active product content and future unsigned agreement rendering. Preserve signed legal snapshots; correcting historical executed documents requires an explicit amendment.