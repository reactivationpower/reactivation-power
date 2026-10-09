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
