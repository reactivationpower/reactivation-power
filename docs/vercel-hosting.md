# Hosting on Vercel

The app keeps its current shape: the Vite frontend (`artifacts/reactivation-power`)
and the Express API (`artifacts/api-server`). It is **not** a Next.js app. One
Vercel project serves both from one address:

- `/` and every page → the built frontend (`index.html` for page links)
- `/api/*` → one Vercel function that runs the same Express app as Replit

Same address means cookies, sign-in and same-origin requests work exactly as
on Replit, with no CORS changes. Replit development and the existing Replit
deployment keep working unchanged (`src/index.ts` with `app.listen`).

## Files

| File | Purpose |
| --- | --- |
| `vercel.json` (repo root) | Install/build/output commands, routing, function time limit and the cron schedules |
| `api/index.mjs` | The Vercel function; re-exports the bundled handler |
| `artifacts/api-server/src/vercel.ts` | Wraps the Express app: waits for Stripe setup once per instance, clear 503 on setup failure |
| `artifacts/api-server/src/index.ts` | Replit server entry (unchanged behavior) |
| `artifacts/api-server/src/seed-super-admin.ts` | One-off first-admin seed + encryption check (not run on Vercel cold starts) |
| `artifacts/api-server/src/lib/deployment-safety.ts` | The one Preview-safety check |
| `package.json` (root) | Pins `pnpm@10.26.1` and Node `24.x`; `build:vercel` script |

## Changes to the existing Vercel project "reactivation-power"

Its current settings are for a Next.js frontend only. Change them in
**Settings → Build and Deployment** (values in `vercel.json` also apply, but set
the dashboard to match so nothing is confusing):

| Setting | Now | Change to |
| --- | --- | --- |
| Framework Preset | Next.js | **Other** |
| Root Directory | `artifacts/reactivation-power` | **empty** (the repository root) |
| Include files outside the root directory | On | Leave on (no effect once root is the repo root) |
| Install Command | default | Override: `pnpm install --frozen-lockfile` |
| Build Command | `next build` | Override: `pnpm run build:vercel` |
| Output Directory | Next.js default | Override: `artifacts/reactivation-power/dist/public` |
| Development Command | `next` | Leave empty (development stays on Replit) |
| Node.js Version | (whatever is set) | **24.x** |
| Skip deployments when there are no changes | On | **Off** |

Also add these two project variables for **all** environments (Production and Preview):

- `NODEJS_HELPERS` = `0` — required. Vercel's helpers otherwise pre-read request
  bodies, which breaks Stripe and Resend webhook signature checks. The API
  refuses every request with a clear error if this is missing.
- `ENABLE_EXPERIMENTAL_COREPACK` = `1` — makes Vercel use the pinned pnpm version.

## Routing order

Vercel checks, in this order:

1. **Real files** from the frontend build (`/assets/*`, images, icons, `/videos/*`).
2. **`/api` and `/api/*`** → the Express function. This includes the raw-body
   webhooks (`/api/webhooks/stripe`, Resend, lead intake) and the short
   tracking links `/api/m/<code>` (referral `?ref=` is kept).
3. **Everything else** → `index.html`, so page links like `/admin/billing` load the app.

## Public marketing videos

On Replit the introduction and walkthrough videos stream through the API's
bounded `/api/public-media/*` route (Replit's published proxy caps response
size). A Vercel build (`VERCEL` is set during the build) points the page at the
same files under `/videos/` instead, which Vercel's CDN serves directly with
full range (seek) support. The API route is not used on Vercel.

## Request and response size limits

A Vercel function accepts at most 4.5 MB in a request body and may return at most
4.5 MB in one response. The app stays inside that on every host
(`artifacts/api-server/src/lib/request-limits.ts`):

- **Uploads** go straight from the browser to Vercel Blob with a token from
  `/api/upload/token` (up to 5 GB). The server-side `/api/upload` fallback only
  accepts files up to 4 MB and answers 413 `UPLOAD_TOO_LARGE` with a message
  pointing at the admin page for anything bigger.
- **Private lesson videos** stream from Blob in byte ranges of at most 4 MiB
  (see `docs/video-playback-verification.md`).
- **Public marketing videos** are static files under `/videos/` on the CDN; the
  API route redirects there and the function bundle contains no MP4s.
- **JSON bodies** are capped at 4 MB. A CSV import larger than that is sent by
  the browser as several consecutive requests (`rowOffset` keeps the file's row
  numbers in review items); matching rules are unchanged because later rows
  match the people earlier rows created, exactly like uploading twice.
- **Agreement PDFs** render from pdfkit bundled into the function with its
  standard font data (esbuild rewrites pdfkit's private `#standard-fonts`
  loaders; see `esbuild.config.mjs`). A PDF over 4 MB is reported as an error
  instead of being cut off.

## Preview safety

Vercel Preview deployments use the same Supabase database as production. On any
Vercel deployment whose `VERCEL_ENV` is not `production`, the app:

- never runs scheduled jobs (`/api/cron/*` answers 503, "Run now" refuses, the
  in-process scheduler stays off),
- never sends real email (logged as failed with a clear reason),
- never sends texts/emails through GoHighLevel,
- never runs the internal sales workers (lead sync, follow-ups, appointment
  confirmations, inbox intake), so it cannot claim or change production queue rows,
- refuses live Stripe (the server will not start in live mode; use test keys).

Production behavior only happens when Vercel itself marks the deployment as
production. Important: a Preview still **reads and writes real data** in the
shared database (sign-ups, edits). Only test with test accounts there.

## Stripe mode

- Vercel always needs `STRIPE_MODE` set (`test` or `live`). If it is missing the API
  answers 503 with "STRIPE_MODE must be set".
- `test` uses `STRIPE_TEST_SECRET_KEY` / `STRIPE_TEST_PUBLISHABLE_KEY` (on Replit the
  Stripe integration is used first). Test mode **never** falls back to live keys.
- `live` uses `STRIPE_SECRET_KEY`. Not allowed on Preview.
- On Replit nothing changed: the workspace runs test mode, the Replit deployment runs live.

## Email

On Vercel, email goes straight to Resend with `RESEND_API_KEY` (same templates,
sender, logging, idempotency keys and attachments). On Replit the Resend
connector is still used when `RESEND_API_KEY` is not set. Without either, every
send is logged as failed with "RESEND_API_KEY is not set".

## First super admin

Vercel does not create the first super admin on start-up. One already exists,
so nothing is needed. If one is ever needed (empty project), run once from a
machine with the production variables (or the Replit workspace — same database):

```
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run seed:super-admin
```

It does nothing if a super admin already exists. The Replit server still runs
this check on boot, as before.


## Database connections

The shared Supabase database allows about 15 sessions for everything: Vercel
production, the Replit workspace, scripts and tests. Vercel keeps the same
Session-pooler `SUPABASE_DB_URL` and the app's own small pool (2 per function
instance), and the database library attaches Vercel's `attachDatabasePool`
helper so idle connections close before an instance is suspended. The pool
size and both timeouts can be changed with the `DB_POOL_*` variables below.
When the database is full, requests get the existing "temporarily unavailable"
503 with `Retry-After`, not a crash. Why the Session pooler (and not the
Transaction pooler) was kept, the worst-case numbers, and the rule for deploy
overlap are in `docs/database-connection-budget.md`.

## Environment variables

None of these are needed by the browser build. No private value may use a
`VITE_` or `NEXT_PUBLIC_` name (Vite only exposes `VITE_*` to the browser; the
app reads none). "Server" = read only by the API function at run time.

| Variable | What it is for | Used by | Production | Preview |
| --- | --- | --- | --- | --- |
| `NODEJS_HELPERS` | Must be `0` (raw webhook bodies) | Vercel | Yes | Yes |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, use pinned pnpm | Build | Yes | Yes |
| `SUPABASE_URL` | Supabase project address | Server | Yes | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access | Server | Yes | Yes |
| `SUPABASE_JWT_SECRET` | Fallback cookie-signing secret, only used if `SESSION_SECRET` is missing | Server | Optional | Optional |
| `SUPABASE_DB_URL` | Postgres, Supabase **Session** pooler URI (port 5432); not the Transaction pooler | Server | Yes | Yes |
| `DB_POOL_MAX` | Connections per function instance (default `2`; keep ≥ 2) | Server | Optional | Optional |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | Wait for a free connection before a friendly 503 (default `5000`) | Server | Optional | Optional |
| `DB_POOL_IDLE_TIMEOUT_MS` | Close idle connections after (default `5000` on Vercel, `10000` on Replit) | Server | Optional | Optional |
| `SESSION_SECRET` | Signs sign-in cookies | Server | Yes | Yes (same value keeps sessions valid) |
| `APP_URL` | Links in emails (`https://patientpipeline.app`) | Server | Yes | Optional |
| `BLOB_READ_WRITE_TOKEN` | Video/file storage (Vercel Blob) | Server | Yes | Yes |
| `STRIPE_MODE` | `live` or `test` (required on Vercel) | Server | `live` | `test` |
| `STRIPE_SECRET_KEY` | Live Stripe secret key | Server | Yes | **No** |
| `STRIPE_WEBHOOK_SECRET` | Live Stripe webhook signing secret | Server | Yes | **No** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Live publishable key (public by design; read by the server and sent to the page through `/api/config`) | Server | Yes | No |
| `STRIPE_TEST_SECRET_KEY` | Sandbox secret key (`sk_test_…`) | Server | No | Yes |
| `STRIPE_TEST_PUBLISHABLE_KEY` | Sandbox publishable key (`pk_test_…`) | Server | No | Yes |
| `STRIPE_TEST_WEBHOOK_SECRET` | Sandbox webhook signing secret | Server | No | Optional |
| `RESEND_API_KEY` | Sending email directly to Resend | Server | Yes | Not needed (sending is off) |
| `RESEND_FROM` | Optional sender override (must be `@patientpipeline.app`) | Server | Optional | Optional |
| `RESEND_WEBHOOK_SECRET` | Checks Resend delivery webhooks | Server | Yes | Optional |
| `RESEND_RECEIVING_API_KEY` | Reading replies for the sales inbox | Server | Yes | Optional |
| `CRON_SECRET` | Protects `/api/cron/*`; Vercel Cron sends it as `Authorization: Bearer …` automatically | Server | Yes | No |
| `CRON_RUN_BUDGET_MS` | Optional: time budget of one cron run (default 240000, must stay below the function limit) | Server | Optional | — |
| `SUPER_ADMIN_EMAIL` | Also: where cron failure alerts go | Server | Yes | No |
| `GHL_API_TOKEN` | GoHighLevel API | Server | Yes | Optional (sends are blocked) |
| `GHL_LOCATION_ID` | GoHighLevel location | Server | Yes | With token |
| `GHL_CALENDAR_ID` | GoHighLevel booking calendar | Server | Yes | With token |
| `AFFILIATE_DATA_KEY_V1` | Encrypts affiliate onboarding data (64 hex characters) | Server | Yes | Yes (same key, or onboarding data can't be read) |
| `AFFILIATE_DATA_KEY_VERSION` | Which key version to use (default `V1`) | Server | Optional | Optional |
| `DEMO_PASSWORD` | Sales demo account password | Server | Yes | Yes |
| `PATIENT_DEMO_OPENAI_API_KEY` | Patient texting demo (fictional) | Server | Optional | Optional |
| `PATIENT_TEXT_INDEPENDENT_CALLBACK_URL` | Patient texting webhook address | Server | Optional | No |
| `SUPER_ADMIN_INITIAL_PASSWORD` | First super admin password (seed script only) | Script | Optional | No |
| `CRON_SCHEDULER` | In-process scheduler switch; not used on Vercel | Replit | — | — |
| `LOG_LEVEL` | Log detail (default `info`) | Server | Optional | Optional |
| `BASE_PATH` | Frontend base path; defaults to `/` | Build | Not needed | Not needed |

Set automatically, do not add: `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_REGION`,
`NODE_ENV`, `PORT`. (`VERCEL_URL` and `VERCEL_REGION` are what turns on the
idle-connection cleanup helper.)
Replit-only, not needed on Vercel: `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`,
`WEB_REPL_RENEWAL`, `REPL_ID`.


## Scheduled jobs (Vercel Cron)

There is no always-on process on Vercel: a function is frozen as soon as it has
answered, so the in-process five-minute scheduler and anything "started after the
response" cannot run there. Vercel Cron calls the existing protected
`/api/cron/*` routes instead. **Plan: Vercel Pro is required** — Hobby allows
only daily crons (no five-minute schedule) and a 60-second function limit,
while this setup uses a five-minute schedule and `maxDuration: 300`.

**Nothing is turned on by this alone.** The `crons` in `vercel.json` take effect
on the next *production* deployment of the project; the cutover (and retiring
the Supabase pg_cron wake, below) happens with the owner's approval.

### Schedule (`vercel.json` → `crons`, all times UTC)

| Path | Schedule | What it is |
| --- | --- | --- |
| `/api/cron/demo-reset` | `0 7,8 * * *` | Demo reset, 3:00 AM ET |
| `/api/cron/auth-cleanup` | `0 8,9 * * *` | Auth / affiliate / marketing cleanup, 4:00 AM ET |
| `/api/cron/billing-retry` | `0 10,11 * * *` | Billing retry + enrollment / affiliate / marketing reconcile + failed billing-email retries, 6:00 AM ET |
| `/api/cron/workers` | `1,6,11,…,56 * * * *` | Every five minutes: lead emails, enrollment and affiliate invitation recovery, sales worker (sales inbox inbound, appointment confirmations, GoHighLevel sync, cadence), marketing reconcile — then a catch-up claim of each daily slot |

- **Daylight saving.** Vercel Cron only knows UTC, so each daily job is scheduled
  at *both* UTC hours its Eastern time can fall on (summer and winter). Each call
  claims the Eastern-day slot in `cron_runs`; the wrong-hour call finds the slot
  taken (or not yet due) and is a no-op, so the job runs exactly once a day.
- **Missed calls.** Vercel does not retry a failed cron call. The five-minute
  `/api/cron/workers` pass also claims any daily slot that has not run yet, so a
  missed day runs late instead of never. The daily crons fire on the hour and the
  workers pass one minute later, so the daily call claims its slot first with a
  full time budget.
- **Time budget.** `functions.api/index.mjs.maxDuration` is 300 s; every cron run
  works within 240 s (`lib/cron/budget.ts`), checks the clock *between* items
  and stops cleanly. A daily job that stops early is stored as `partial` and the
  next call for the same slot (the second UTC hour, the workers pass, or Run
  now) continues it from the progress already in the database: billing retry
  skips the customers the slot already attempted (a declined card is not
  retried again while later customers wait) and skips the follow-up steps it
  already finished; enrollment, affiliate-history and marketing reconcile and
  all cleanups stop between items or delete in batches, and only a step that
  stopped early is re-run; demo reset only starts a practice when ≥ 2 minutes
  are left and rebuilds a deferred one next time; the five-minute workers
  leave unclaimed rows for the next pass. Progress is also checkpointed into
  the run row while it is still running (after every billing customer and
  after every step), so a function killed outright is continued from its last
  checkpoint when the stale slot is taken over 30 minutes later, never
  restarted. The admin "Run now" button continues a partial run too, rather
  than starting the job over. A slot still partial after 24 continuations is
  reported as failed (email to `SUPER_ADMIN_EMAIL`).
- **Patient texting.** `/api/cron/patient-texting` now answers GET as well as
  POST (Vercel Cron only sends GET) but is **not scheduled** while patient
  texting is off. Add it to `crons` when texting is turned on.
- **Trigger and visibility.** A call with Vercel's `vercel-cron/…` user agent is
  recorded in `cron_runs` with trigger `vercel-cron` ("Vercel Cron" on the
  super-admin Scheduled jobs card); the Overdue badge and failure emails work
  unchanged.
- **After-response work.** The sales sync nudge after a save, the confirmation
  messages right after a booking and the sales-worker wake after lead changes
  go through `lib/after-response.ts`, which hands the promise to Vercel's
  `waitUntil` (`@vercel/functions`) with a 45-second budget. On Replit the same
  code simply runs in the background. Nothing depends on it finishing: the
  workers pass picks up whatever is left.
- **Locks.** Workers take their session-level advisory locks and release them on
  the same connection inside one call (the appointment worker now uses a
  non-blocking try-lock per lead), so a frozen function never leaves a lock held.
- **Timers.** The in-process scheduler never starts on Vercel (even with
  `CRON_SCHEDULER=on`) and database read-usage reporting flushes lazily from the
  next query instead of a five-minute timer.
- **Preview.** Every `/api/cron/*` route answers 503 on Preview deployments and
  the job registry refuses before claiming a slot.

### Sales automation readiness after the move

The Leads settings "Scheduler running" check reads one capability,
`scheduler_wake`, through the shared rule list (`lib/shared/src/sales-automation.ts`).
On Replit the Supabase pg_cron job stamps it (`source: supabase`); on Vercel the
five-minute cron stamps the same capability (`source: vercel-cron`). Either keeps
the checklist green; no second rule exists. While both schedulers run, the
worker is simply woken twice — its durable claims make that harmless. At cutover,
retire the pg_cron job with `retireNativeWake()` (`lib/sales-leads/wake.ts`,
operator-run) so it stops double-triggering; `/api/cron/sales-leads` and
`/api/cron/lead-emails` remain as names for the same workers pass.

## Not covered here (separate tasks)

- Turning the crons on for the live site and retiring the pg_cron wake (cutover, owner approval).
