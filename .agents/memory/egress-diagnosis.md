---
name: Supabase egress diagnosis
description: Separate API script-download waste from direct-connection usage before attributing a billing spike.
---
Use the billed service breakdown before attributing an egress spike to an expensive-looking query.

**Why:** An initial review found whole-library script downloads, but the user's service tooltip showed the spike was almost entirely Shared Pooler Egress. The script loader uses PostgREST, a different billed route. Reducing its downloads does not establish that the main spike is fixed.

**How to apply:** Distinguish PostgREST/API traffic from the direct Postgres/Supavisor connection used by the backend and DB-backed tests. Read-only query statistics show calls and returned rows, not historical transferred bytes; they can also span months and evict old entries. Do not present those counters as a daily byte attribution or blame development, backups, or a specific job without evidence.

Leading suspect (unconfirmed as of 2026-10-14): DB-backed tests run against the shared Supabase from every task-agent environment. The large-list queue benchmark seeds ~10k synthetic patients in temp tables and reads the full set repeatedly (~250–300 MB estimated egress per suite run); many approved tasks merged the spike day. Temp-table queries get new query IDs each session and pg_stat_statements is near its 5000-entry cap, so run counts cannot be recovered. The Supabase pg_cron five-minute sales wake (since the spike day) reads little; compare later daily totals to rule it in or out.

Keep the large speed benchmark off against shared Supabase.

**Why:** The user explicitly asked to turn it off to avoid repeated large downloads; historical attribution remains unconfirmed.

**How to apply:** Do not re-enable it during routine validation. Any future benchmark should use a separate test database and require renewed authorization.
