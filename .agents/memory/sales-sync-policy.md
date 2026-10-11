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

Portal SMS must pin the operator-confirmed existing location number, not rely on
GHL's implicit sender or infer a sender from prior conversations.
**Why:** Verified read access and a single currently active number are not proof
of A2P/send readiness or permission to silently switch numbers later.
**How to apply:** Keep readiness confirmation separate from read-only capability
probes. Uncertain sends need provider evidence, never body/time matching or blind
replay. See docs/portal-sms-transport.md for the integration contract and limits.

Confirm can arrive before the post-commit contact sync finishes (fast form-to-calendar visitors).
**Why:** Users hit "Contact synchronization is still pending" on their first Confirm; the sync and booking share the `sales-send:<lead>` advisory lock.
**How to apply:** Wait briefly for the durable sync only while NOT holding the lead lock (holding it deadlocks the worker), then retry the locked attempt; never write the contact from booking.

The user requires a straight flow: button → form → submit → calendar → booked page. A live inquiry must never stop at a staff-review screen.
**Why:** A visitor whose phone matched another lead (different email) was blocked from booking; the user said they must be able to book.
**How to apply:** Same email = same lead. Phone-only match with a different email = separate lead with a staff "possible duplicate" note; its GHL contact omits the shared phone (the location disallows duplicate phones).

Every new lead must get both emails and texts, regardless of older records (user, 2026-10-11: "I don't ever want there to be a reason why somebody doesn't receive communications").
**Why:** A real lead's confirmation text was held back because an older GHL contact (same person, older email) held his phone.
**How to apply:** Texts go through whichever GHL contact currently holds the entered phone (re-read fresh); never skip for shared-phone reasons. Only a real opt-out (DND/STOP) on that contact stops texts. Replies land on that older contact's GHL conversation. Imports still use the review queue.
