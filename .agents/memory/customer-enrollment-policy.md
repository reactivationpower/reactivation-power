---
name: Customer and enrollment boundaries
description: Commercial identity and lead enrollment scope required by the user.
---
Customers are commercial identities; Viewers are participant/access records; Payments are offers and transactions. Their IDs must never be treated as interchangeable.

**Why:** The user explicitly separated these concepts when requesting a customer home, including pending enrollments and records whose offers were deleted.

**How to apply:** Keep customer navigation stable independently of offers and accounts. Reuse the existing enrollment/signature/payment process rather than introduce a second checkout or change service access, pricing, card requirements, or paid-customer semantics.

Opening or cancelling enrollment is not conversion. Existing linked leads continue their saved enrollment; another offer must be explicit.

**Why:** The user requires truthful progress and recoverable invitation failures without duplicate records or charges.

**How to apply:** Link a lead only after durable enrollment persistence, retain attribution and cadence-stop semantics, and present saved, invitation, signing, completion, and billing outcomes separately.

## Talking to customers after Won
Customer conversations use the linked sales lead's record: one shared history, never a copy or a separate customer inbox. A call logged for a customer must not move the lead off Won.
**Why:** staff lost messaging once a lead was Won, and a "No Answer" call used to knock customers back to Attempting Contact.
