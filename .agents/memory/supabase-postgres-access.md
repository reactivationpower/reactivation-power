---
name: Supabase Postgres access & migrations
description: How the app and drizzle-kit reach Supabase's Postgres directly, why drizzle-kit push is forbidden, and what DB-backed tests must clean up.
---
- All drizzle tables live in the Supabase project; dev and prod share it. The app and drizzle-kit use `SUPABASE_DB_URL` (Session pooler URI). There is no Replit database any more.
  **Why:** the owner wanted one database; the Replit DB only existed because Supabase DDL was unavailable at the time.
- The pooler's TLS cert is signed by Supabase's own CA: `pg` needs `ssl: { rejectUnauthorized: false }`. The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from the workspace.
- **Never `drizzle-kit push`** against Supabase — the public schema has ~25 tables drizzle does not model and push would drop them. Use `generate` → review → `migrate`; `tablesFilter` in drizzle.config.ts is a second guard. Keep `out`/`schema` relative in the config (drizzle-kit mangles absolute paths once a snapshot exists).
- Tests gated on `SUPABASE_DB_URL` write to the *shared* database. Every DB-backed test must delete everything it creates, including side tables filled indirectly (`billing_notifications`, `commission_entries`, `cron_runs`), and mock `sendEmail` — an unmocked send throws inside the outbox, leaves rows `pending`, and the daily cron then tries to deliver them.
- If the owner's pasted connection string fails with "password authentication failed", ask for a fresh database password reset rather than debugging the string.
- `deletePaymentLink` removes the link + terms but leaves the `customers` row and any agreement behind; clean those manually after e2e runs.
