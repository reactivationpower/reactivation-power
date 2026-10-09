---
name: Agreement e-sign flow constraints
description: Durable rules for the owned e-sign flow — edit/sign linearization, one agreement per link, when the signed copy is delivered, Stripe element readiness
---
- **Edit vs sign is linearized in the database, not in application checks.** A version bump only lands when the row is still unsigned and on the expected version (conditional update inside a transaction); signing only lands when the row is unsigned and on the version the customer saw. Keep it that way — a signature on a non-current version permanently blocks payment.
- **One agreement per payment link is a DB constraint** (unique link_id) and creation is conflict-safe; do not add code paths that assume a second agreement can exist for a link.
- **Signed-copy email + PDF go out on completion (subscription started), not at signature time.** The sign-request email wording reflects this; if a "copy at signature" is wanted, that is a product change, not a bug.
- **Stripe Elements readiness must be keyed by client secret, not a boolean.** An amount edit updates the same PaymentIntent, so the element never remounts and `onReady` never re-fires; call `elements.fetchUpdates()` instead.
- **pdfkit built-in fonts are WinAnsi only** — route all text through the ANSI-mapping wrapper or non-Latin-1 characters render as garbage.
- **Enrollment policy:** Subscriptions require two different cards, primary and backup; one-time/full-payment agreements require one card. Signature and card collection should stay on the agreement page.
  **Why:** The user explicitly clarified that the two-card requirement applies to subscription customers only and wants enrollment acceptance separate from a saved signature.
  **How to apply:** Preserve signed-but-incomplete versus completed enrollment, and apply the card requirement by offer type.
- **Agreement recipient roles:** Additional email recipients are carbon-copy recipients, not additional signers.
  **Why:** The user explicitly distinguished people receiving a copy from the signing individual.
  **How to apply:** Keep recipient delivery controls separate from signer identity and signing authority.
