---
name: CSV patient workflow decisions
description: Scope and safety boundaries for CSV patient matching before service-aware calling and EHR integration.
---
The patient-matching design must work for CSV-only practices; EHR integration is a later input to the same process, not a prerequisite.

**Why:** The user explicitly asked whether CSV practices get the same process and authorized starting with the CSV workflow.

**How to apply:** Use stable practice/source/patient identifiers when available, preserve leading zeroes, and keep source labels consistent between uploads. Phone-only identity is unsafe for households; unresolved identity conflicts require an explicit human decision.

Repeat uploads must preserve staff notes, opt-outs, primary calling context, and existing outreach schedules. Imported service histories do not by themselves authorize another outreach cycle.

**Why:** Broad repeated reports and multiple niches must not create independent callable copies of a person or silently restart calls. The user has not approved cross-service spacing intervals or rules for renewed eligibility.

**How to apply:** Keep the CSV foundation separate from service-aware outreach. Additional services and treatment dates can be recorded without automatically changing the primary script or resetting follow-ups. Do not describe service-specific eligibility, coordinated secondary-service calling, or Lead Follow-Up identity coordination as delivered until their behavior is implemented and policy choices are settled.
