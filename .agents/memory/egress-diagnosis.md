---
name: Supabase egress diagnosis
description: Separate API script-download waste from direct-connection usage before attributing a billing spike.
---
Use the billed service breakdown before attributing an egress spike to an expensive-looking query.

**Why:** An initial review found whole-library script downloads, but the user's service tooltip showed the spike was almost entirely Shared Pooler Egress. The script loader uses PostgREST, a different billed route. Reducing its downloads does not establish that the main spike is fixed.

**How to apply:** Distinguish PostgREST/API traffic from the direct Postgres/Supavisor connection used by the backend and DB-backed tests. Read-only query statistics show calls and returned rows, not historical transferred bytes; they can also span months and evict old entries. Do not present those counters as a daily byte attribution or blame development, backups, or a specific job without evidence.
