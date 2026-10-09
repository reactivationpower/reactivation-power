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
