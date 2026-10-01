---
name: Portal calling decisions
description: User-selected billing and caller-ID requirements for proposed optional Twilio calling.
---

For the proposed optional portal-calling feature, each practice should connect or create its own Twilio account and pay Twilio directly for calling usage.

**Why:** The user explicitly selected direct Twilio billing rather than Patient Pipeline-managed usage billing.

**How to apply:** Scope customer-owned account onboarding, not parent-account subaccounts billed to Patient Pipeline. This choice does not authorize implementation, set a separate feature price, or settle recording or mobile calling behavior.

Use the practice's existing phone number as outbound caller ID where supported.

**Why:** The user explicitly selected the existing practice number rather than a separate Twilio number or a choice of both.

**How to apply:** Require ownership verification and confirm Twilio support. Do not assume permission to port the number or automatically substitute a dedicated number. Mobile calling behavior remains undecided.