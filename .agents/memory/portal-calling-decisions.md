---
name: Portal calling decisions
description: User-selected billing and caller-ID requirements for proposed optional Twilio calling.
---

For the proposed optional portal-calling feature, each practice should connect or create its own Twilio account and pay Twilio directly for calling usage.

**Why:** The user explicitly selected direct Twilio billing rather than Patient Pipeline-managed usage billing.

**How to apply:** Scope customer-owned account onboarding, not parent-account subaccounts billed to Patient Pipeline. This choice does not authorize implementation, set a separate feature price, or settle recording or mobile calling behavior.

Use the practice's existing phone number as outbound caller ID where supported.

**Why:** The user explicitly selected the existing practice number rather than a separate Twilio number or a choice of both.

**How to apply:** Require ownership verification and confirm Twilio support. Do not assume permission to port the number or automatically substitute a dedicated number.

The user selected “Computers only first (recommended)” for the initial in-portal calling launch. Mobile calling is outside the initial scope.

**Why:** The user explicitly chose a computer-only first version.

**How to apply:** Scope the initial calling experience to computer browsers. Do not add mobile calling to the first release. Any separate feature charge remains undecided; these scope choices are not authorization to implement.

The user selected “No recording initially (recommended).”

**Why:** The user explicitly excluded recording from the first version.

**How to apply:** Do not enable recording in the initial calling integration. Future practice-owned recording is a separate decision. Twilio recording must be triggered through call instructions or its API; owning an account does not by itself enable recording for portal calls. See https://www.twilio.com/docs/voice/recording-settings.