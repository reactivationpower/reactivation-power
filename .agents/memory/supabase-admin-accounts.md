---
name: Supabase access constraints
description: What the agent can and cannot do against the Supabase project (no DDL, email limits) and the resulting admin-account design
---
The Supabase project is reachable only with the service-role key (REST + Auth admin API). There is no DB connection string, management token or exec_sql RPC, so **the agent cannot run DDL**; new tables need the user to run SQL in the Supabase dashboard.

**Why:** Admin accounts needed a profile table; instead role/rate/active flags live in the auth user's `app_metadata` and deactivation uses `ban_duration`. Authorization must read the live profile per request (short cache, invalidated on mutation) — the cookie is identity only, never the source of role.

**How to apply:** Features needing new tables should reuse the app_metadata pattern or hand the user a SQL file up front. Supabase's built-in mailer is rate-limited (~2/hour) and rejects example.com addresses, so any email-based flow needs a manual fallback; never log one-time links or token hashes.
