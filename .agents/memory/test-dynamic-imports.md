---
name: Concurrent dynamic imports in test fixtures
description: Avoid assuming a dynamic module mock protects every concurrent invocation.
---
Concurrent booking tests under Vitest 5 exhibited one dynamic import using a mock and another executing the real module in the same Promise.all. Do not assume a mock alone proves that background/adjacent capabilities are unreachable.

**Why:** A two-client test failed inside real appointment registration even when the one-client case used the declared module mock.

**How to apply:** Supply realistic disabled settings through the isolated database fixture as a second boundary, block external requests, and avoid global shared-data access in test helpers. Check the caught exception before blaming pool exhaustion.
