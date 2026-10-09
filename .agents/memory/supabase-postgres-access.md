---
name: Supabase Postgres access & migrations
description: How the app and drizzle-kit reach Supabase's Postgres directly, why drizzle-kit push is forbidden, and what DB-backed tests must clean up.
---

## Protected native HTTP wakeups

Hosted `pg_net` request/response tables can be owned by `supabase_admin` with PUBLIC access; `postgres` cannot revoke those grants. Never assume successful REVOKE statements actually protected the queue.

**Why:** Effective privilege checks showed anonymous/authenticated roles could read queued headers despite REVOKE statements; PostgreSQL emitted notices rather than failing the migration.

**How to apply:** Verify permissions before queuing sensitive headers. Use synchronous `http` for protected native wakeups, resolving authentication from Vault at execution time with bounded timeouts and status-only output. Do not put the cron bearer into this hosted queue.
- All drizzle tables live in the Supabase project; dev and prod share it. The app and drizzle-kit use `SUPABASE_DB_URL` (Session pooler URI). There is no Replit database any more.
  **Why:** the owner wanted one database; the Replit DB only existed because Supabase DDL was unavailable at the time.
- The pooler's TLS cert is signed by Supabase's own CA: `pg` needs `ssl: { rejectUnauthorized: false }`. The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from the workspace.
- **Never `drizzle-kit push`** against Supabase — the public schema has ~25 tables drizzle does not model and push would drop them. Use `generate` → review → `migrate`; `tablesFilter` in drizzle.config.ts is a second guard. Keep `out`/`schema` relative in the config (drizzle-kit mangles absolute paths once a snapshot exists).
- Tests gated on `SUPABASE_DB_URL` write to the *shared* database. Every DB-backed test must delete everything it creates, including side tables filled indirectly (`billing_notifications`, `commission_entries`, `cron_runs`), and mock `sendEmail` — an unmocked send throws inside the outbox, leaves rows `pending`, and the daily cron then tries to deliver them.
- Retention/deletion tests must use an isolated disposable schema with no public search-path fallback, not execute a global cleanup on shared application tables.
  **Why:** dev and production share Supabase; otherwise testing a maintenance function can delete real security state.
  **How to apply:** copy only needed table definitions, scope every test connection to that schema, and drop it afterward.
- Use transaction-local temporary tables for large synthetic performance fixtures, rather than bulk-seeding shared patient records.
  **Why:** Development and production share Supabase; a latency benchmark must not expose synthetic patients to real callers or background jobs.
  **How to apply:** Copy the real schema and indexes into temporary tables on one checked-out connection and roll back in cleanup.
- Persistent test owners and cleanup scopes must be unique per test run, not hardcoded.
  **Why:** Separate task workspaces use the same Supabase database; concurrent runs can delete each other's fixtures and produce misleading “not found” failures.
  **How to apply:** Generate run-specific identities for database fixtures and restrict cleanup to the rows owned by that run.
- If the owner's pasted connection string fails with "password authentication failed", ask for a fresh database password reset rather than debugging the string.
- `deletePaymentLink` removes the link + terms but leaves the `customers` row and any agreement behind; clean those manually after e2e runs.
- Review generated migrations against earlier custom SQL and the actual schema before applying them; custom migrations can leave Drizzle snapshots behind the database.
  **Why:** A custom SQL change can be re-emitted by the next generation even though its columns already exist. Never assume every generated statement is new, and never repair this with schema push.
- When parallel tasks generate the same migration number, retain incoming metadata and regenerate the task's migration after it; do not hand-merge snapshots.
  **Why:** Task workspaces share Supabase, so an earlier task migration can already be applied even after its number collides on merge.
  **How to apply:** Preserve custom constraints and RLS in the regenerated SQL, and make the renumbered migration safe for both existing task-created tables and fresh databases.
- The shared Supabase session pool has a 15-client ceiling; parallel regression suites can exceed it while the app is running.
  **Why:** Isolated workers each create their own pool; provider connection-limit failures occurred in otherwise passing database tests, including tests unrelated to the changes being checked.
  **How to apply:** Bound test-worker concurrency when diagnosing this error, keep disposable test pools small and release them, and do not mistake resource exhaustion for a functional failure or silently skip database tests.
- A successful migration command can silently skip pending SQL when another task has already applied a newer journal timestamp to the shared database.
  **Why:** Parallel task databases are not isolated: a new custom migration was older than the live migration high-water mark, so the command reported success without creating its tables.
  **How to apply:** Compare pending journal timestamps with the database high-water mark before applying; preserve applied entries, order genuinely pending migrations after it, and verify the required tables/columns afterward. For a parallel-task filename collision, accept the incoming snapshot and regenerate the next snapshot. If that task's identical SQL was already applied to the shared database, preserve its original applied timestamp after verifying SQL equivalence; a new timestamp would attempt duplicate table creation.
