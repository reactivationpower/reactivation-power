# Reactivation Power

Training portal + patient-reactivation dialer for healthcare/service businesses: learners watch course videos, run call queues from imported contact lists, and admins manage courses, participants, scripts, and payment links. Ported from a Vercel/Next.js app into this workspace.

## Run & Operate

- Workflows: `artifacts/api-server: API Server` (Express, `/api/*`) and `artifacts/reactivation-power: web` (Vite SPA at `/`). Restart both after server changes.
- `pnpm run typecheck` — full typecheck. Verify artifacts with `pnpm --filter @workspace/<pkg> run typecheck`, not `build`.
- Data: Supabase project `jbdymqqpolkoevyypjxd` (service-role access, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Media (videos, thumbnails, attachments): Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
- Other env: `SESSION_SECRET` (cookie signing), `ADMIN_PASSWORD`, `DEMO_PASSWORD`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (served to the SPA by `GET /api/config`), `GHL_*` (GoHighLevel booking), `CRON_SECRET`.
- Original Next.js source is kept in `.migration-backup/` for reference.

## Where things live

- `artifacts/api-server/src/actions/*` — the original Next server actions, verbatim. Exposed via `POST /api/actions/:module/:fn` (`src/routes/actions.ts`), which holds the **allow-list of callable actions with their required auth** (`public` / `portal` / `admin`). Every new action must be added there.
- `artifacts/api-server/src/routes/pages.ts` — one loader per former server-component page (`GET /api/pages/<route>`), replicating the original page's data fetching server-side. Contract: `artifacts/api-server/PAGE_LOADERS.md`.
- `artifacts/api-server/src/shims/*` — `next/headers`, `next/navigation`, `next/cache` emulation backed by an AsyncLocalStorage request context (`src/lib/request-context.ts`).
- `artifacts/api-server/src/routes/{media,upload,progress,templates,admin-emails,cron,config}.ts` — ported Next API routes.
- `artifacts/reactivation-power/src/lib/api.ts` (RPC client), `src/hooks/use-page-data.ts` (page loader hook), `src/hooks/use-router.ts` (next/navigation `useRouter` drop-in; `router.refresh()` re-fetches loaders), `src/app/actions/*` (thin client stubs mirroring server actions).

## Architecture decisions

- Actions are exposed by name through one RPC route rather than rewritten as REST; page data goes through per-page loaders instead of exposing the data layer generically. Auth is enforced at the route level (cookies `tp_session` / `tp_admin`) in addition to the checks inside the actions.
- A `redirect()` from an action/loader is returned as JSON and followed client-side with a full navigation (cookies are set server-side). Only same-origin path redirects are followed (`safeRedirect`).
- `revalidatePath` is a no-op; components call `router.refresh()` after mutations so `usePageData` re-fetches.
- Frontend and API share one origin through the workspace proxy; CORS is intentionally not enabled.

## Gotchas

- Files under `artifacts/reactivation-power/src` and `artifacts/api-server/src/actions|lib` are largely CRLF and many carry `// @ts-nocheck`; typecheck passing does not guarantee no undefined identifiers — read diffs.
- Loaders serialize `Map`s as plain objects keyed by id; pages must use `obj[id]`, not `.get(id)`.
- `/api/upload/token` and `/api/upload` require the admin cookie; server-side fallback uploads are capped at 100 MB (large videos go direct to Blob from the browser).
- Admin participants page lists owners only (staff nested under their owner), so its count is lower than the dashboard's total viewers — this matches the original app.
