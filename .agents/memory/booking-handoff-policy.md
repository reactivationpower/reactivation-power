---
name: Saved inquiry booking policy
description: Secure calendar handoff, privacy UI removal, and uncertain provider booking writes.
---
Preserve the existing day/time/timezone calendar across website, strategy-call, and healthcare entry paths. A CRM outage must not send someone whose inquiry was saved back to a blank form. Identity ambiguity is a help/review state, not permission to use unsafe contact upsert.

**Why:** The user requested restoration of the existing calendar, not a redesign, and explicitly prohibited bypassing identity protection.

**How to apply:** Use an opaque reference to durable server context; resolve/retry provider synchronization only on explicit booking confirmation. Reconcile uncertain appointment writes rather than blindly retrying. Preserve the website-only confirmation/walkthrough destination.

Reserve `ref` for affiliate attribution, not scheduling.

**Why:** Browser verification showed the global referral handler consumes and removes `ref`, silently breaking a booking handoff on reload.

**How to apply:** Use a separate scheduling parameter and test it with the global referral handler mounted.

The user requested removal of both the analytics consent popup and floating analytics controls everywhere, without granting consent or overriding declines, DNT, or GPC.

**Why:** Removing visible controls is not permission to attach behavioral history to new visitors.

**How to apply:** Retain opt-in gates and distinguish operational outcomes from detailed session reporting; new visitors no longer opt into detailed tracking through this UI.

Strategy-call confirmation and reminder emails and texts must say attendees need to be in front of a computer because the meeting is on Google Meet.

**Why:** The user explicitly requested this preparation instruction in both email and text messages.

**How to apply:** Include the computer requirement and identify Google Meet in both channels, not only on the booking page.

Strategy-call emails and texts should instruct attendees to watch the 4-minute walkthrough video before the meeting. Explain that it gives a basic understanding and that additional questions or further explanation are welcome on the call.

**Why:** The user explicitly requested this preparation instruction alongside the computer requirement.

**How to apply:** Include the walkthrough link and preparation wording in confirmation and reminder messaging, retaining the Google Meet/computer instruction.

The confirmation text should tell attendees they should also have received an email and ask them to check their spam folder if they do not see it.

**Why:** The user explicitly requested this wording.

**How to apply:** Include this in confirmation SMS copy; do not claim the email was sent if the email send failed.
