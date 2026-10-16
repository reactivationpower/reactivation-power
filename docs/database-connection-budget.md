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
acquisition/connect wait is 5 seconds; idle clients close after 10 seconds.
DB_POOL_MAX (1–15), DB_POOL_ACQUIRE_TIMEOUT_MS (1–60000) and
DB_POOL_IDLE_TIMEOUT_MS (1–300000) accept positive integer strings only.
Invalid settings fail startup. Application names label environment and PID.

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
