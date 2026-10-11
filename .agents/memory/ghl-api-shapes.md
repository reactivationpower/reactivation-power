---
name: GoHighLevel API reply shapes
description: Verified live reply shapes for GoHighLevel endpoints; test fakes must copy these, not guesses.
---
- `GET /calendars/events/appointments/:id` returns `{ appointment: {...}, traceId }` — not `event`. `startTime` is an offset local string (e.g. `2026-10-12T15:00:00-04:00`); the object includes `locationId`, `calendarId`, `contactId`, `assignedUserId`, `address` (Meet link), `appointmentStatus`, `deleted`.
  **Why:** a fake reply using the wrong key let a test pass while production paused every booking confirmation forever.
  **How to apply:** before writing a GHL fake, do one read-only live call and print only the keys (no personal values); copy that shape into the test.
