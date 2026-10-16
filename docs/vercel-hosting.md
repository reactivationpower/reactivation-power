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
| `vercel.json` (repo root) | Install/build/output commands and routing |
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
| `SUPABASE_DB_URL` | Direct Postgres (session pooler) | Server | Yes | Yes |
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
| `CRON_SECRET` | Protects `/api/cron/*` | Server | Yes | No |
| `GHL_API_TOKEN` | GoHighLevel API | Server | Yes | Optional (sends are blocked) |
| `GHL_LOCATION_ID` | GoHighLevel location | Server | Yes | With token |
| `GHL_CALENDAR_ID` | GoHighLevel booking calendar | Server | Yes | With token |
| `AFFILIATE_DATA_KEY_V1` | Encrypts affiliate onboarding data (64 hex characters) | Server | Yes | Yes (same key, or onboarding data can't be read) |
| `AFFILIATE_DATA_KEY_VERSION` | Which key version to use (default `V1`) | Server | Optional | Optional |
| `DEMO_PASSWORD` | Sales demo account password | Server | Yes | Yes |
| `PATIENT_DEMO_OPENAI_API_KEY` | Patient texting demo (fictional) | Server | Optional | Optional |
| `PATIENT_TEXT_INDEPENDENT_CALLBACK_URL` | Patient texting webhook address | Server | Optional | No |
| `SUPER_ADMIN_EMAIL` | First super admin (seed script only) | Script | Optional | No |
| `SUPER_ADMIN_INITIAL_PASSWORD` | First super admin password (seed script only) | Script | Optional | No |
| `CRON_SCHEDULER` | In-process scheduler switch; not used on Vercel | Replit | — | — |
| `LOG_LEVEL` | Log detail (default `info`) | Server | Optional | Optional |
| `BASE_PATH` | Frontend base path; defaults to `/` | Build | Not needed | Not needed |

Set automatically, do not add: `VERCEL`, `VERCEL_ENV`, `NODE_ENV`, `PORT`.
Replit-only, not needed on Vercel: `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`,
`WEB_REPL_RENEWAL`, `REPL_ID`.

## Not covered here (separate tasks)

- Scheduled jobs and the five-minute workers on Vercel Cron.
- Database connection limits for many function instances.
