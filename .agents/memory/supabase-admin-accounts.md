---
name: Supabase access constraints
description: Why admin profiles live in Supabase Auth app_metadata rather than a table, plus Supabase mailer limits
---
Historically the Supabase project was reachable only with the service-role key (REST + Auth admin API), so the agent could not run DDL. Since Sept 2026 `SUPABASE_DB_URL` gives direct Postgres access (see supabase-postgres-access.md); the admin-profile-in-app_metadata design below was kept anyway.

**Why:** Admin accounts needed a profile table; instead role/rate/active flags live in the auth user's `app_metadata` and deactivation uses `ban_duration`. Authorization must read the live profile per request (short cache, invalidated on mutation) — the cookie is identity only, never the source of role.

**How to apply:** New tables now go through drizzle migrations (supabase-postgres-access.md); keep admin profiles in app_metadata for consistency. Supabase's built-in mailer is rate-limited (~2/hour) and rejects example.com addresses, so any email-based flow needs a manual fallback; never log one-time links or token hashes.
