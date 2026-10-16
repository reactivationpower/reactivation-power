# Database connection budget and rollout

## Evidence and limits

The reported Supabase session allowance is 15. Read-only deployment metadata
confirmed a public, successfully built autoscale deployment; the last-day logs
contained seven lines matching capacity errors. This proves failures occurred,
not which clients occupied the sessions. Replica limits, deployment overlap,
other workspaces, test workers and Supabase pooler client metrics were not
available through those diagnostics. No connection strings were printed and no
live load test, data mutation, credential or hosting change was performed.

## Aggregate budget

Every Node process importing the DB library owns its own pool. Default max is 2;
acquisition/connect wait is 5 seconds; idle clients close after 10 seconds on
Replit and after 5 seconds on Vercel (see "Vercel" below).
DB_POOL_MAX (1–15), DB_POOL_ACQUIRE_TIMEOUT_MS (1–60000) and
DB_POOL_IDLE_TIMEOUT_MS (1–300000) accept positive integer strings only.
Invalid settings fail startup. Application names label environment, host
(`replit`, `vercel-production`, `vercel-preview`) and PID, e.g.
`patient-pipeline:production:vercel-production:1234`, so `pg_stat_activity`
can attribute sessions to a host. Keep DB_POOL_MAX at 2 or more on every host:
inbox intake holds one client (session lock) while borrowing a second one for
its transaction, and a pool of 1 would time that out every time.

A **conditional** realistic budget is:

| Consumer | Processes | Sessions |
|---|---:|---:|
| Production steady state | 2 | 4 |
| Old/new deployment overlap | 2 additional | 4 |
| One development API | 1 | 2 |
| One test worker | 1 | 2 |
| Operational reserve | — | 3 |

Total: 12 allocated + 3 reserve = 15. Maximum supported simultaneous processes
at the default is **six**, not six production replicas plus development.
Formula: sum(each process pool max) + external clients + reserve <= 15.
In-process cron shares the API pool, not an extra pool. External job processes,
parallel task workspaces, scripts and old builds must be counted separately.
The current test configuration allows two workers; do NOT run that alongside
the full overlap budget. Use --maxWorkers=1, stop dev during overlap, or provide
isolated test infrastructure. Pools with custom settings need separate accounting.
A small local pool does not guarantee safety under unrestricted autoscaling.

## Vercel

### Pooling decision: Session pooler everywhere

Vercel keeps the same `SUPABASE_DB_URL` (Supabase **Session** pooler, port
5432) and the same small per-instance `pg.Pool`, plus Vercel's pool-cleanup
helper. The Transaction pooler (port 6543) was considered and rejected for
request traffic; the reasons, checked against the current Supabase and Vercel
documentation on 2026-10-16:

- Supabase documents that transaction mode does not keep session state: no
  prepared statements, `SET`, `LISTEN`, cursors or **session-level advisory
  locks**. Each statement may run on a different Postgres backend. Four paths
  in this app hold `pg_advisory_lock` / `pg_try_advisory_lock` across several
  autocommit statements and external provider calls (inbox send, saved-inquiry
  booking, appointment messages, inbox intake). On the transaction pooler the
  lock could be taken on one backend and the unlock sent to another, leaving
  a leaked lock or a silently unprotected section. Session mode keeps one
  backend per pooled client, so lock, work and unlock always share a session.
- A hybrid (transaction pooler for requests, session pooler only for lock
  code) needs a second connection string and two pools; using the wrong pool
  fails silently, and every drizzle transaction would also have to be audited
  for prepared-statement use. It is the documented escalation path below, not
  the default.
- Vercel's Fluid compute guidance for Postgres is a module-level `pg.Pool`
  shared by all concurrent requests of an instance, `attachDatabasePool` from
  `@vercel/functions` so idle connections close before the instance is
  suspended, a short idle timeout (about 5 seconds), and never a pool of 1.
  That is what the DB library does when `VERCEL` is set.
- Supabase's session mode allows roughly as many clients as the pool size
  (15 here); beyond that the pooler answers `max clients reached`, which the
  app already turns into the friendly 503 below. The budget, not a different
  pooler, is what has to hold.

### Settings on Vercel

The DB library picks its defaults from the host: `DB_POOL_MAX` 2,
`DB_POOL_ACQUIRE_TIMEOUT_MS` 5000 and `DB_POOL_IDLE_TIMEOUT_MS` 5000 on Vercel
(10000 idle on Replit). All three can be set per Vercel environment in the
project variables (see `docs/vercel-hosting.md`). When `VERCEL` is set the
library attaches `attachDatabasePool(pool)`: after every client release the
instance stays awake for idle timeout + 100 ms so pg's own idle timer closes
the session before Vercel suspends the instance. Busy clients (a held advisory
lock, an open transaction) are never closed by this; it only lets idle ones
expire. Off Vercel nothing is attached.

Work that must finish after the response (worker wakes after a save or a
booking, the post-commit sales drain) is registered with Vercel's `waitUntil`
through `continueAfterResponse`. Without it, Vercel could suspend the instance
mid-lock or mid-transaction, freezing that session until the instance resumed
or was destroyed. On Replit the helper is a no-op. Cron routes already await
their jobs inside the request.

### Worst case on Vercel

Fluid compute runs many concurrent requests on one instance through one pool,
so the number of **instances** is what multiplies. With the default of 2:

| Consumer | Instances / processes | Sessions |
|---|---:|---:|
| Vercel production, steady state | 2 | 4 |
| Vercel deploy overlap (old + new instances) or a cron waking an extra instance | 2 additional | 4 |
| Replit workspace API (development) | 1 | 2 |
| One script or one test worker | 1 | 2 |
| Operational reserve | — | 3 |

Total: 12 allocated + 3 reserve = 15. Rule: Vercel instances × `DB_POOL_MAX`
+ Replit workspace + scripts/tests + reserve ≤ 15. At the default that is at
most four Vercel instances alive at once (including old ones draining). A
Vercel Preview deployment someone is actively using counts like a script
(2 sessions): keep previews short, or stop the workspace API while one is in
use. Vercel's cron requests land on production instances, so they do not add a
separate pool, but they can start an extra instance during a spike; the
overlap row covers that.

### Rollout overlap rule

1. During the host switch, the Replit deployment and Vercel production run at
   the same time. Count both: with both at steady state (4 + 4) plus the
   workspace (2) the budget is already at 10 before any deploy overlap. Switch
   DNS/traffic, then stop the Replit deployment before relying on Vercel
   headroom.
2. During a Vercel deploy, old instances keep serving until drained while new
   instances start. Treat a deploy as two extra instances (4 sessions). Do not
   run shared-database tests, scripts or a busy workspace API during a deploy,
   and enable Vercel rolling releases if traffic makes overlap larger.
3. Watch `pg_stat_activity` by `application_name` (host label) and the 503
   rate after each deploy. If sessions approach 12, lower `DB_POOL_MAX` is
   not the fix (nested borrows need 2): reduce instances or move to the
   escalation path.
4. Escalation path if the budget proves too small: a Supabase **Transaction**
   pooler URL for request traffic plus a separate small Session-pooler pool
   reserved for the four advisory-lock paths, or a larger Supabase compute
   size (bigger pool). Both need approval and validation (locks, prepared
   statements, migrations, TLS, integration flows). No load test is run
   against the shared live database.

## Runtime behavior

Affiliate reports reuse the partner read and run query work sequentially;
candidate lookup starts only when Search is selected. Manual Search also retries
the same query. Existing report refresh and financial calculations are retained.
Enrollment card/customer helpers use the existing transaction, not a second
pooled connection. Completion delivery uses its existing atomic per-recipient
claim and provider idempotency key rather than holding a spare advisory-lock
transaction across PDF creation, mail and independent DB calls.

Idle socket failures are handled without crashing; pg removes the failed client.
Action authorization, actions, page loaders and final middleware translate
recognized capacity/connect errors (including wrapped causes) to a no-store
503 with Retry-After: 5. Protected logs retain queue/connection counts but no
SQL, connection strings or parameters. UI query retries stop on 503; explicit
Retry/Search can recover. Mutations are never automatically replayed: a failure
after a commit must be checked by refreshing before submitting again.
Scheduler ticks cannot overlap locally, rejected ticks are caught, and shutdown
stops timers, drains requests/jobs and ends the pool with a 25-second deadline.

## Approval-required rollout

1. Have the operator check Supabase session-client metrics and every host's
   actual maximum process count, including old/new overlap. Inspect application
   names for future builds; older unnamed clients remain unattributable.
2. Confirm/cap hosting concurrency to the budget above (including all other
   hosts) or obtain enough headroom. Do not publish into unrestricted replica
   growth assuming these defaults alone solve aggregate exhaustion.
3. Pause shared DB tests during rollout; account for existing ten-connection
   pools until old builds have drained. Approve hosting/environment changes
   and publishing separately. This task does not apply those changes.
4. Publish only after approval; observe total sessions, queue counts, 503 rate,
   affiliate profile reads and manual Retry after capacity returns. Do not
   terminate other clients or replay writes to recover.
5. If this budget is too small, separately validate a Supabase transaction
   pooler endpoint: transaction/advisory-lock semantics, prepared statements,
   migrations, TLS and integration flows. Switching modes or raising capacity
   requires approval; neither is done here.

Local tests use the real pg Pool queue with fake socket clients, mocked reports,
and synthetic errors. They demonstrate bounded clients/timeouts/recovery, not
live production recovery or production throughput.
