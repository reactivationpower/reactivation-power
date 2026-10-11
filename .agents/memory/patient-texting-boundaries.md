---
name: Patient campaign texting boundaries
description: Direct billing and demo-only authorization for patient texting; separate from internal sales.
---
Patient campaign texting must not reuse internal-sales GHL credentials or workflow state. Messaging and production AI must be independently office-owned/direct billed, without Patient Pipeline-funded parent/subaccounts, fallback credentials, number purchases, or invented feature pricing.

**Why:** The user explicitly required these commercial and isolation boundaries.

**How to apply:** Fail closed on unverified capabilities; phone entry is not texting readiness. Keep demo clocks/transcripts/reset and usage budgets separate from calls, real campaigns, and analytics.

The user authorized up to $1 total for fictional-demo OpenAI usage only. Reset/replay must not replenish this authorization. No real patient data or live texting was authorized.

**Why:** Explicit limited authorization in the conversation.

**How to apply:** Inspect the persistent authorization ledger before additional demo runs; ask for new authorization if exhausted. Never use the demo key as production fallback.
