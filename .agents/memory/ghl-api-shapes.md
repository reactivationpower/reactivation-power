---
name: GoHighLevel API reply shapes
description: Verified live reply shapes for GoHighLevel endpoints; test fakes must copy these, not guesses.
---
- `GET /calendars/events/appointments/:id` returns `{ appointment: {...}, traceId }` — not `event`. `startTime` is an offset local string (e.g. `2026-10-12T15:00:00-04:00`); the object includes `locationId`, `calendarId`, `contactId`, `assignedUserId`, `address` (Meet link), `appointmentStatus`, `deleted`.
  **Why:** a fake reply using the wrong key let a test pass while production paused every booking confirmation forever.
  **How to apply:** before writing a GHL fake, do one read-only live call and print only the keys (no personal values); copy that shape into the test.

GoHighLevel contact search is eventually consistent, and `/contacts/upsert` can merge into an existing contact even when no email/phone matches were sent (it overwrote another contact's email in a live repair).
**Why:** A stale search hit plus upsert twice rewrote the owner's real contact; the local unique contact link was the only thing that caught it.
**How to apply:** Re-read every search match with GET /contacts/{id} before trusting it; create new contacts with plain POST /contacts/, never upsert; never write to a contact already linked to another local lead. A phone owned by another GHL contact (different email) is omitted, and texts are skipped for that lead.
