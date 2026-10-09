---
name: Enrollment notification policy
description: Alert recovery, rollout boundaries, and shared-link viewer interpretation
---

Enrollment alerts must be recoverable without retrying a charge or making successful enrollment depend on notification delivery.

**Why:** Signature, verified-card persistence, and authoritative enrollment completion are business facts; a failed notification must not undo them or charge the customer again.

**How to apply:** Keep delivery outside business finalization. Preserve durable milestone evidence and idempotent notification recovery when adding paths such as reconciliation or new payment offers.

A pre-rollout card's replacement is not a new first-card milestone. Preserve the historical milestone date without emitting old alerts.

**Why:** A rollout cutoff alone does not prevent an old milestone being re-announced when its card is replaced after rollout.

**How to apply:** When adding or moving card-save evidence, baseline existing cards with historical dates and never reset a first-save milestone on replacement.

An agreement opened through a shared link proves a displayed/acknowledged screen, not who personally read it. Data loading, link scanning, and staff preview are not customer views.

**Why:** The user explicitly required this distinction for enrollment alerts.

**How to apply:** Keep view acknowledgment on an actually rendered screen after human interaction; avoid wording that identifies the viewer from a shared token.

View auditing and enrollment-notification eligibility are separate: standard agreements still need their view audit and certificate history even when they do not produce enrollment alerts.

**Why:** Restricting display acknowledgment to the enrollment flow removes existing agreement timeline/certificate evidence when loader-side tracking is removed.

**How to apply:** Preserve acknowledged display in both signing flows; apply enrollment-only eligibility when projecting alerts, not when recording document views.
