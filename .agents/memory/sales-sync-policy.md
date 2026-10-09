---
name: Sales sync safety
description: Durable sync fast lane and uncertainty boundaries.
---
Keep prompt contact/note processing separate from maintenance and messaging.
Do not add an untracked provider write to form submission as a speed workaround.
**Why:** Separate form writes duplicated queue work and made saved inquiry handoff depend on provider availability.
**How to apply:** Enqueue within the local transaction, dispatch only after commit, and preserve the independent scheduled recovery wake.

Booking must reuse the durable contact queue, never create a contact independently. Uncertain contact creation must block staff retry and booking confirmation.
**Why:** The booking handoff and sales queue share identity ownership; protecting just one entry point still permits a duplicate after a lost provider response.
**How to apply:** Reconcile evidence before another write; never treat a missing local contact ID as proof that the provider did not accept creation.
