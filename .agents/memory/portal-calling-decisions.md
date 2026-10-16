---
name: Portal calling decisions
description: User-selected billing and caller-ID requirements for proposed optional Twilio calling.
---

For the proposed optional portal-calling feature, each practice should connect or create its own Twilio account and pay Twilio directly for calling usage.

The user explicitly rejected an umbrella account: “I dont want an umbrella account. LEts go back to what I was planning before.”

**Why:** The user explicitly selected direct Twilio billing rather than Patient Pipeline-managed usage billing.

**How to apply:** Scope independently practice-owned account onboarding. Do not pursue Patient Pipeline umbrella Organizations or parent-account subaccounts, and do not repeatedly ask the user to investigate that architecture. This choice does not authorize implementation or set a separate feature price. Computer-only scope and the exclusion of recording are specified below.

Use the practice's existing phone number as outbound caller ID where supported.

**Why:** The user explicitly selected the existing practice number rather than a separate Twilio number or a choice of both.

**How to apply:** Require ownership verification and confirm Twilio support. Do not assume permission to port the number or automatically substitute a dedicated number.

The user selected “Computers only first (recommended)” for the initial in-portal calling launch. Mobile calling is outside the initial scope.

**Why:** The user explicitly chose a computer-only first version.

**How to apply:** Scope the initial calling experience to computer browsers. Do not add mobile calling to the first release. Any separate feature charge remains undecided; these scope choices are not authorization to implement.

The user requires: “Just dont do call recording then.”

**Why:** The user explicitly excluded call recording after discussing account ownership, billing, and compliance.

**How to apply:** Exclude call recording, recording toggles, storage, and playback from the proposed Patient Pipeline calling integration. Do not treat recording as an automatically planned later phase or propose it again unless the user reopens it. This scope choice does not authorize calling implementation or settle the account architecture.