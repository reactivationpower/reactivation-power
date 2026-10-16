---
name: Shared session connection budget
description: Aggregate pool budget and runtime transaction constraints.
---
Treat the Supabase 15-session allowance as shared across production replicas,
deployment overlap, all development workspaces, scripts and test workers.
**Why:** Production capacity errors do not identify the occupying processes;
limiting each pool alone cannot guarantee safety under autoscaling.
**How to apply:** Consult docs/database-connection-budget.md before approving
rollouts or raising pool limits. Never hold a pooled transaction while calling
helpers that borrow another connection; pass the existing transaction through.
Do not verify capacity by load-testing the shared live database.

Vercel keeps the Session pooler and a small per-instance pool with Vercel's
pool-cleanup helper; the Transaction pooler was rejected, not just deferred.
**Why:** Four paths hold session advisory locks across autocommit statements
and provider I/O; transaction mode may run each statement on a different
backend, so lock and unlock could land on different sessions. A hybrid
two-pool design fails silently when the wrong pool is used.
**How to apply:** Anything that outlives a response on Vercel (worker wakes,
post-commit drains) must be registered with Vercel's waitUntil, or a suspended
instance freezes its lock/transaction. Instance count, not pool size, is the
multiplier in the budget; keep per-process pools at 2 or more because inbox
intake borrows a second client while holding a session lock. Escalation path:
Transaction pooler for requests plus a separate session pool for lock code.

Isolated test schemas do not isolate PostgreSQL advisory-lock keys. Give each
fixture its own worker-lock namespace while retaining production lock behavior.
**Why:** Concurrent task-agent suites against the shared database can silently
skip workers when another schema's fixture holds the same global lock, causing
intermittent missing deliveries even though each fixture's data is isolated.
**How to apply:** Override lock constants in the test boundary, not production;
continue testing overlapping wakes inside that fixture with the same local key.
