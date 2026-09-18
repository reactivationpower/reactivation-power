# Reactivation Power

Training portal + patient-reactivation dialer for healthcare/service businesses: learners watch course videos, run call queues from imported contact lists, and admins manage courses, participants, scripts, and payment links. Ported from a Vercel/Next.js app into this workspace.

## Run & Operate

- Workflows: `artifacts/api-server: API Server` (Express, `/api/*`) and `artifacts/reactivation-power: web` (Vite SPA at `/`). Restart both after server changes.
- `pnpm run typecheck` — full typecheck. Verify artifacts with `pnpm --filter @workspace/<pkg> run typecheck`, not `build`.
- Data: Supabase project `jbdymqqpolkoevyypjxd` (service-role access, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Media (videos, thumbnails, attachments): Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
- Other env: `SESSION_SECRET` (cookie signing), `SUPER_ADMIN_EMAIL` (bootstrap super admin, seeded at API start; optional `SUPER_ADMIN_INITIAL_PASSWORD` creates it ready to sign in), `DEMO_PASSWORD`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (served to the SPA by `GET /api/config`), `GHL_*` (GoHighLevel booking), `CRON_SECRET`, `RESEND_FROM` / `RESEND_WEBHOOK_SECRET` (see Transactional email).
- Original Next.js source is kept in `.migration-backup/` for reference.

## Where things live

- `artifacts/api-server/src/actions/*` — the original Next server actions, verbatim. Exposed via `POST /api/actions/:module/:fn` (`src/routes/actions.ts`), which holds the **allow-list of callable actions with their required auth** (`public` / `portal` / `admin`). Every new action must be added there.
- `artifacts/api-server/src/routes/pages.ts` — one loader per former server-component page (`GET /api/pages/<route>`), replicating the original page's data fetching server-side. Contract: `artifacts/api-server/PAGE_LOADERS.md`.
- `artifacts/api-server/src/shims/*` — `next/headers`, `next/navigation`, `next/cache` emulation backed by an AsyncLocalStorage request context (`src/lib/request-context.ts`).
- `artifacts/api-server/src/routes/{media,upload,progress,templates,admin-emails,cron,config}.ts` — ported Next API routes.
- `artifacts/reactivation-power/src/lib/api.ts` (RPC client), `src/hooks/use-page-data.ts` (page loader hook), `src/hooks/use-router.ts` (next/navigation `useRouter` drop-in; `router.refresh()` re-fetches loaders), `src/app/actions/*` (thin client stubs mirroring server actions).

## Admin accounts (Supabase Auth)

- Admins sign in at `/admin-login` with email + password via Supabase Auth (`actions/admin-auth.ts`). The old shared `ADMIN_PASSWORD` is no longer read.
- Admin profile (role `super_admin` | `sales_rep`, `default_commission_rate`, `admin_active`) lives in the Supabase Auth user's `app_metadata` — there is no `admin_users` table because we have no DDL access to the Supabase project (service role only). Helpers: `lib/data/admin-users.ts`. Every request re-reads the live profile (60s cache, invalidated by Team mutations), so demotion/deactivation take effect immediately; deactivation also bans the auth user. The `SUPER_ADMIN_EMAIL` seed only runs when no super admin profile exists at all (it never revives a deactivated/demoted account); `SUPER_ADMIN_INITIAL_PASSWORD` is applied only while the bootstrap account has never signed in. Unit tests: `pnpm --filter @workspace/api-server test`.
- The `tp_admin` cookie carries `{ userId, email, name, role }`; use `requireAdmin('admin' | 'super_admin')` from `lib/auth/admin-session.ts` inside actions to get the acting admin and stamp records with `userId`.
- Auth levels for actions/pages: `admin` = any active admin (sales reps only get `/admin/payments*`), `super_admin` = everything else. Team management at `/admin/team` (invite, role, rate, deactivate, one-time invite/reset link). Invite emails use Supabase's default mailer (built-in SMTP is rate-limited); when sending fails the UI shows a shareable link that our own `completeAdminInvite` verifies via `verifyOtp(token_hash)`.
- "View portal as client": super admins can open a participant's portal (`actions/admin-view-as.ts`); the portal session is tagged `impersonatedBy` and shows a banner; session rows get `user_agent` prefix `admin-view-as:`.

## Transactional email (Resend)

- Sent through the Resend connector via `@replit/connectors-sdk` (`ReplitConnectors().proxy("resend", ...)`); the connector key is send-only, so domains/tracking are managed in the Resend dashboard. Code: `artifacts/api-server/src/lib/mail/` (`layout.ts` branded shell, `templates.ts` the six templates + sample data, `send.ts` `sendEmail()` which **never throws**, `index.ts` typed senders such as `sendPortalWelcomeEmail`, `sendPaymentFailedEmail`, `sendSubscriptionCancelledEmail`, `sendAgreementSentEmail`). Payment-failed / cancelled / agreement senders are ready for the billing and e-signature flows to call.
- Sender: code default `noreply@links.reactivationpower.com`; overridden by env `RESEND_FROM`. `RESEND_FROM` is currently set to `noreply@reactivationpower.com` because only the apex domain is verified in Resend — delete the env var once `links.reactivationpower.com` is verified.
- Every send is logged to `email_log` in the **Replit Postgres** (`lib/db/src/schema/email-log.ts`, drizzle; `pnpm --filter @workspace/db run push` after schema changes). Failures are also `logger.error`'d. Resend webhook `POST /api/webhooks/resend` (`routes/webhooks-resend.ts`) verifies the Svix signature with `RESEND_WEBHOOK_SECRET` and fills delivered/opened/clicked/bounced on the row — to enable, add the webhook in Resend pointing at the production URL and turn on open/click tracking for the domain.
- Admin UI: `/admin/emails` → "Account emails" tab (`components/admin/transactional-emails.tsx`): live preview, test send, recent-sends log. Actions: `mail.listTransactionalTemplates / sendTestEmail / listEmailLog` (super admin).
- Hooks: portal accounts created by payment provisioning, admin "Add Participant", or an owner adding a caller send `portal_welcome` (login link is `/login?email=…`, prefilled); admin invites and "Resend invite email" send `admin_invite` (Supabase's own mailer is no longer used; a manual link is returned only if the send fails); `confirmPayment` sends `payment_received` with Stripe's hosted receipt URL.

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
