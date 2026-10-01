---
name: Patient Pipeline launch positioning
description: User-approved combined launch offer and boundaries of the marketing rebrand.
---

Patient Pipeline's launch promotes Reactivation and Lead Follow-Up together at one launch price, not as separate purchase choices.

**Why:** On 2026-10-01, after reviewing the conflict between reactivation-only marketing and separate-product landing copy, the user explicitly selected “Both together at one launch price.”

**How to apply:** Keep both products represented in public marketing while explaining their different conversations: past-service-aware reactivation versus campaign/offer-aware new-inquiry follow-up. The practice's staff make the calls. No numeric launch price, discount, expiry, or guaranteed return was supplied; obtain actual terms rather than inventing them.

Marketing rebranding is not authorization for a domain migration, entitlement change, or alteration of historical agreements.

**Why:** The approved work concerns public copy and email branding, not contractual or billing changes. Working delivery URLs and sender addresses were intentionally retained.

**How to apply:** Use Patient Pipeline display branding and preserve legal/billing data. The user subsequently approved moving marketing-email call destinations to the existing Patient Pipeline domain after a one-email test. That approval does not extend to transactional links, sender identities, DNS, or historical agreements.

When moving public marketing to a new domain, preserve the old domain's email destinations through a live domain mapping or path-preserving redirects; updating source templates alone cannot repair links in delivered emails.

**Why:** A successfully published Patient Pipeline site did not prevent older-domain marketing links from showing Replit's “This app isn't live yet” page. Shared templates intentionally retained those older destinations, and imported email templates are independent copies.

**How to apply:** Compare the actual email destination with verified deployment domains. Check both apex and www hosts, restore old-link reachability, and update exported/imported templates separately. Do not infer an unpublished app merely from the error page.

Treat email image addresses as part of a domain-link repair, not just call-button destinations.

**Why:** Updating the booking buttons left the exported emails' logo on the unavailable old domain, so a successfully tested button still produced a visibly broken email.

**How to apply:** Inspect both href and src destinations across the generated package. Check that public image responses contain actual image bytes, then render an exported email and confirm the logo decodes before presenting the replacement ZIP.