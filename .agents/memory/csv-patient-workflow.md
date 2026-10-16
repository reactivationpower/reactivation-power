---
name: CSV patient workflow decisions
description: Scope and safety boundaries for CSV patient matching before service-aware calling and EHR integration.
---
The patient-matching design must work for CSV-only practices; EHR integration is a later input to the same process, not a prerequisite.

**Why:** The user explicitly asked whether CSV practices get the same process and authorized starting with the CSV workflow.

**How to apply:** Use stable practice/source/patient identifiers when available, preserve leading zeroes, and keep source labels consistent between uploads. Phone-only identity is unsafe for households; unresolved identity conflicts require an explicit human decision.

Repeat uploads must preserve staff notes, opt-outs, an active sequence's calling context, and promised callbacks. An upload must not reset the outreach clock or reopen a declined service.

**Why:** Broad repeated reports and multiple niches must not create independent callable copies of a person or silently restart calls.

**How to apply:** Import histories without resetting schedules or outcomes. Service rotation may choose a different next script only under the owner-approved rules below. Lead Follow-Up identity coordination is separate; do not describe it as delivered by reactivation service rotation.

The owner wants a newly eligible service to take priority after the existing service finishes its current calling cycle, rather than interrupting that cycle.

**Why:** The owner described patients with multiple service histories and wants later calls to use the newer niche without overlapping outreach.

**How to apply:** Finish the active sequence. For both the first switch and later rotations, the owner approved exactly 90 days from the last actual call attempt, not from CSV upload or a scheduled due date. Prioritize the newest unattempted eligible service, then rotate the services; do not run independent quarterly schedules. Keep requested callbacks and appointment confirmations separate from routine rotation.

Treatment dates remain optional. The owner approved trusting the practice's uploaded list when dates are missing; when supplied, the most recent office treatment across all services holds new outreach until more than three calendar months afterward. A clear service rejection stays closed until staff explicitly reopen it.

**Why:** The product must support practices that upload prefiltered CSV lists without treatment dates, while preventing recent treatments and explicit rejections from generating inappropriate new outreach.

**How to apply:** Do not require missing-date review as a new prerequisite. Reassess supplied dates across the person, preserve promised callbacks/confirmations, and never clear a patient-wide opt-out through a service reopening or import.
