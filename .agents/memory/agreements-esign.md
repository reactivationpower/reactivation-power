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
- **Initials interaction:** The user wants recipients to type initials in the top section once, then click each subsequent section to reuse them rather than type repeatedly.
  **Why:** The user requested this after walking through a sent agreement.
  **How to apply:** Reuse explicitly entered initials but retain a deliberate acknowledgment action and confirmed save for every section; never initial all sections automatically.
- **Negotiated agreement prices:** Automatically fill the offer-specific agreement with the amounts entered in New Customer: the full purchase amount for one-time offers, and separate setup and monthly amounts for subscriptions. Do not require manually edited text or a separate template for every negotiated price.
  **Why:** The user wants salespeople's negotiated amounts to flow into the customer's agreement automatically.
  **How to apply:** Select the template by offer type and merge the entered amounts, not standard list prices.
- **Subscription commercial term:** The setup payment covers the initial month; the first recurring payment and the 12-month agreement start one calendar month after the setup payment, on the same day of the month, followed by 12 consecutive monthly payments.
  **Why:** The user explicitly described the initial month as separate from the subsequent 12-month agreement.
  **How to apply:** Do not count the setup payment as one of the 12 recurring payments. Use the user's confirmed calendar-month timing for new enrollment, not the existing 30-day interval; preserve existing subscriptions.
- **Enrollment completion must not hold row locks across account provisioning.**
  **Why:** Provisioning uses a separate database connection to update the same customer, so awaiting it while holding that customer's row lock deadlocks completion.
  **How to apply:** Commit durable payment identifiers before confirming a charge, use a recoverable claim for finalization, and run network-dependent provisioning and document delivery without customer row locks.
