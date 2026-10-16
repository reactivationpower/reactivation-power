---
name: Supabase egress diagnosis
description: Separate API script-download waste from direct-connection usage before attributing a billing spike.
---
Use the billed service breakdown before attributing an egress spike to an expensive-looking query.

**Why:** PostgREST and direct Postgres/pooler traffic are different billed routes. Reducing downloads on one route does not establish that excess usage on another route is fixed.

**How to apply:** Distinguish PostgREST/API traffic from the direct Postgres/Supavisor connection used by the backend and DB-backed tests. Read-only query statistics show calls and returned rows, not historical transferred bytes; they can also span months and evict old entries. Do not present those counters as a daily byte attribution or blame development, backups, or a specific job without evidence.

Keep the large speed benchmark off against shared Supabase.

**Why:** The user explicitly asked to turn it off to avoid repeated large downloads; historical attribution remains unconfirmed.

**How to apply:** Do not re-enable it during routine validation. Any future benchmark should use a separate test database and require renewed authorization.

For download diagnostics, log aggregate sizes and code locations only, not SQL text, parameters, returned records, or raw request paths. Do not write diagnostic records back into Supabase.

**Why:** The user authorized read tracking to find excess downloads, not collection of patient details or extra database traffic. Serialized result sizes are estimates and exclude protocol overhead and other clients.

**How to apply:** Compare app/test estimates with Supabase's daily service totals. Tracking starts when the changed code runs; it cannot explain historical usage by itself.
