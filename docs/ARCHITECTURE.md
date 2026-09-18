# Reactivation Power: Full System Architecture and Data-Flow Reference

This document explains, end to end, how the Reactivation Power application is built: where every kind of data lives, which code reads and writes it, how the pieces are wired together, and why the structure is the way it is. It is written for an engineer (or an AI coding tool) taking over the project with no prior context. Everything in here was verified against the live codebase and the live Supabase schema on the date of writing, not reconstructed from memory.

Repository: `reactivationpower/reactivation-power` (branch `main`). Deployed on Vercel. Production domain `www.reactivationpower.com` (apex 308-redirects to `www`).

---

## Table of contents

1. What the product is
2. Technology stack and runtime
3. The three backends at a glance
4. Environment variables (complete list, who reads each)
5. Security and access-control model
6. Database schema (every table, every column, every constraint)
7. Identity, accounts, sessions, and login
8. Entitlements: courses, niches, and sectors
9. Training system (courses, modules, videos, attachments, Blob, progress, locks)
10. Reactivation system, part 1: niches and the script engine
11. Reactivation system, part 2: contacts, CSV import, pipeline stages
12. Reactivation system, part 3: the call queue and batch release
13. Reactivation system, part 4: the call screen, dispositions, and cadence
14. Analytics (portal and admin)
15. Admin dashboard, page by page
16. Client portal, page by page
17. Sales demo account (Ridgeline Chiropractic)
18. Public marketing site and lead funnel (GoHighLevel)
19. Payments (Stripe) and account provisioning
20. Email template system
21. Complete route map (pages, API routes, server actions, cron)
22. Static assets and the `scripts/` folder
23. Known quirks, gotchas, and deliberate design decisions
24. Migration checklist

---

## 1. What the product is

Reactivation Power sells a two-part system to healthcare practices (chiropractic, med spa, dental, weight loss) and, in a smaller way, to home-services businesses (HVAC, plumbing):

1. **Training**: gated video courses that teach front-desk staff how to call lapsed patients.
2. **Dialer**: a guided, branching call script per service ("niche"), a patient contact list uploaded from the office's EHR/CRM, a paced call queue, call logging with automatic follow-up scheduling, and per-caller analytics.

One Vercel project hosts four distinct surfaces:

| Surface | URL prefix | Who uses it | Auth |
|---|---|---|---|
| Public marketing site + lead funnel | `/`, `/how-it-works`, `/schedule-a-call`, `/healthcare/*`, `/pay/*` | Prospects | None |
| Client portal (training + dialer) | `/portal/*`, `/login` | Practice owners and their callers | Participant session cookie |
| Admin dashboard | `/admin/*`, `/admin-login` | Reactivation Power staff | Admin password cookie |
| Sales demo | `/demo` | Reactivation Power salespeople | Shared demo password, then a participant session |

---

## 2. Technology stack and runtime

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.2.6, App Router, React 19 | `proxy.ts` (Next 16 name for middleware) guards `/portal` and `/admin` |
| Language | TypeScript 5.7 | `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so type errors do not fail the build |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), `tw-animate-css` | Theme tokens live in `app/globals.css`; no `tailwind.config.js` |
| UI kit | shadcn (style `base-nova`, built on `@base-ui/react`) | `components.json`; icons from `lucide-react`. Base UI dialogs use the `render` prop, NOT `asChild`. `components/ui/button.tsx` does NOT support `asChild` |
| Rich text | TipTap 3 (`@tiptap/react`, starter-kit, link) | Contact notes editor; output sanitized with `sanitize-html` |
| Charts | Recharts 3 via `components/ui/chart.tsx` | Portal analytics |
| Data fetching | React Server Components + Server Actions | No client-side data library in active use (`swr` is installed but the portal is RSC-driven) |
| Database | Supabase Postgres (project ref `jbdymqqpolkoevyypjxd`) accessed with `@supabase/supabase-js` using the **service-role key** | No Supabase Auth, no RLS policies; see section 5 |
| File storage | Vercel Blob (**private** store) via `@vercel/blob` | Training videos, thumbnails, attachments |
| Payments | Stripe (`stripe` v22 server SDK, `@stripe/react-stripe-js` + `@stripe/stripe-js` client) | Embedded Checkout, live keys |
| CRM / calendar | GoHighLevel API v2 (`services.leadconnectorhq.com`) via hand-written `lib/ghl.ts` | Lead upsert, notes, free slots, appointment booking |
| Analytics | `@vercel/analytics` (production only) | Root layout |
| Misc | `fflate` (zip export of emails), `qrcode` (payment link QR), `sonner` (toasts), `next-themes` (installed; app is forced light) | |
| Package manager | pnpm (lockfile `pnpm-lock.yaml`); `pnpm.overrides.hono = 4.12.25` | Dev deps include `pg` (used only by one-off `scripts/*.mjs`) and `sharp` (used only in v0 sessions for image trimming; not in app code) |
| Fonts | Geist + Geist Mono via `next/font/google` in `app/layout.tsx` | |
| Images | `next.config.mjs` sets `images.unoptimized: true` | `next/image` is used for the logo only; media thumbnails use plain `<img>` through the media proxy |

Deployment specifics in `vercel.json`: one cron, `GET /api/cron/demo-reset` at `0 8 * * *` (08:00 UTC daily).

---

## 3. The three backends at a glance

```
                 ┌──────────────────────────────────────────────────────────────┐
                 │                        Next.js on Vercel                      │
                 │                                                                │
  Browser ─────▶ │  RSC pages  ──▶ lib/data/*.ts ──▶ lib/supabase/admin.ts ─────┼──▶ Supabase Postgres
                 │  Server Actions (app/actions/*.ts) ──────────────────────────┼──▶   (service role,
                 │  Route Handlers (app/api/**)                                  │      25 tables)
                 │                                                                │
                 │  /api/upload/token  ◀── browser uploads DIRECTLY ─────────────┼──▶ Vercel Blob (private)
                 │  /api/media  ──── streams private blobs with Range support ───┼──▶   videos/ thumbnails/ attachments/
                 │                                                                │
                 │  lib/ghl.ts ─────────────────────────────────────────────────┼──▶ GoHighLevel API v2
                 │  lib/stripe.ts ──────────────────────────────────────────────┼──▶ Stripe
                 │  app/actions/leads.ts ───────────────────────────────────────┼──▶ zippopotam.us (zip → city/state)
                 └──────────────────────────────────────────────────────────────┘
```

**Supabase holds all structured data**: users (called *participants*), sessions, courses/modules/videos metadata, watch progress, activity events, niches, every screen and button of every call script, contacts (patients), calls, follow-ups, pipeline stages, CSV service mappings, landing-page leads, payment links, admin login attempts.

**Vercel Blob holds all binary files**: the actual MP4 videos, JPEG thumbnails, and downloadable attachments. Supabase stores only the Blob *pathname* (for example `videos/M5V1_HC_1080p-0w5FS5CRag8TCC1iuJcG8rtTwEndiQ.mp4`) in `videos.video_url`, `videos.thumbnail_url`, `courses.thumbnail_url`, `attachments.file_url`. Because the store is **private**, nothing in Blob is directly reachable by URL; every byte is streamed through `/api/media`.

**There is no Supabase Storage and no Supabase Auth in use.** The database has zero views, zero custom functions, zero custom triggers. All logic is in application code.

---

## 4. Environment variables

These are set on the Vercel project. The middle column is what the code actually reads (verified by grep).

| Variable | Read by | Purpose |
|---|---|---|
| `SUPABASE_URL` | `lib/supabase/admin.ts` | Postgres REST endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` | Service-role key; bypasses RLS. The ONLY database credential the app uses |
| `SUPABASE_JWT_SECRET` | `lib/auth/token.ts`, `lib/auth/admin-token.ts` | HMAC secret for both session cookies (NOT used for Supabase JWTs). Falls back to the literal `'dev-secret'` if unset |
| `ADMIN_PASSWORD` | `app/actions/admin-auth.ts` | Single shared admin password |
| `DEMO_PASSWORD` | `app/actions/demo.ts` | Shared password for `/demo` |
| `CRON_SECRET` | `app/api/cron/demo-reset/route.ts` | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `BLOB_READ_WRITE_TOKEN` | `@vercel/blob` (implicitly) | Private Blob store token; never referenced by name in code |
| `STRIPE_SECRET_KEY` | `lib/stripe.ts` | Live Stripe secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `components/landing/pay-checkout.tsx`, `components/admin/payments-manager.tsx` | Stripe.js on the client |
| `GHL_API_TOKEN` | `lib/ghl.ts` | GoHighLevel Private Integration token (sub-account). Scopes: `contacts.write`, `calendars.read`, `calendars/events.write` |
| `GHL_LOCATION_ID` | `lib/ghl.ts` | GHL sub-account |
| `GHL_CALENDAR_ID` | `lib/ghl.ts` | The strategy-call calendar |
| `NODE_ENV` | `app/layout.tsx`, `lib/auth/session.ts`, `app/actions/admin-auth.ts` | Analytics only in production; cookie `secure` fallback |
| `POSTGRES_URL_NON_POOLING` | `scripts/*.mjs` only | Direct Postgres connection for the historical seed scripts. Not used at runtime |

Present on the project but **not read by any application code**: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`. These are auto-injected by the Vercel–Supabase integration. They can be carried over harmlessly; nothing breaks if they are absent.

---

## 5. Security and access-control model

### 5.1 The one database client

`lib/supabase/admin.ts` exports `getAdminClient()`: a module-level singleton `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`. It is marked `import 'server-only'` so it can never be bundled to the browser. **Every** database read and write in the application goes through this client. Consequently:

- **Row Level Security is ENABLED on all 25 public tables but there are ZERO policies.** This means the `anon` and `authenticated` Postgres roles (i.e. anyone hitting the Supabase REST API with the public anon key) can read or write nothing. The service role bypasses RLS entirely. Protection is therefore 100% application-level: every server action and page filters by the signed-in participant's account. If you migrate to a different data layer, preserve this: either keep RLS-with-no-policies plus service-role access, or write real policies.
- Standing rule: any table created via SQL/MCP must get `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;` in the same batch. Supabase only auto-enables RLS for dashboard-created tables. (One backup table, `script_dedash_backup_20260911`, was created without RLS in Sept 2026 and was readable via the anon key for ~6 days; it has since been locked. It contains only script text, no PHI.)

### 5.2 Two independent cookie sessions

Both are HMAC-SHA256-signed, base64url-encoded JSON payloads of the form `<payload>.<signature>`, verified with `crypto.timingSafeEqual`. Neither is a JWT. Neither is stored server-side for verification (the `sessions` table is for analytics only).

| | Participant session | Admin session |
|---|---|---|
| Cookie name | `tp_session` | `tp_admin` |
| Code | `lib/auth/token.ts`, `lib/auth/session.ts` | `lib/auth/admin-token.ts`, `app/actions/admin-auth.ts` |
| HMAC key | `SUPABASE_JWT_SECRET` | `` `admin:${SUPABASE_JWT_SECRET}` `` |
| Payload | `{ participantId, sessionId, issuedAt }` | `{ role: 'admin', issuedAt }` |
| Lifetime | 30 days (`SESSION_MAX_AGE`) | 7 days (`ADMIN_SESSION_MAX_AGE`) |
| Set by | `login()` in `app/actions/auth.ts`; `enterDemo()`/`switchDemoView()` in `app/actions/demo.ts` | `adminLogin()` in `app/actions/admin-auth.ts` |
| Cookie flags | `httpOnly`, `path=/`; when the request is HTTPS (checked via `x-forwarded-proto`): `sameSite=none`, `secure`, `partitioned` (so it survives the v0 preview iframe); otherwise `sameSite=lax` | Same |

### 5.3 Route protection (`proxy.ts`)

```
matcher: ['/portal/:path*', '/admin/:path*']
/portal/*  → requires a valid tp_session   else redirect /login?next=<path>
/admin/*   → requires a valid tp_admin     else redirect /admin-login?next=<path>
```

Every portal page ALSO calls `getCurrentParticipant()` (section 7) and redirects to `/login` if the participant row is missing or `is_active = false`, so deactivating a participant takes effect on their next navigation even with a valid cookie.

### 5.4 Admin login hardening

`adminLogin()` compares the password with `timingSafeEqual`, records every attempt in `admin_login_attempts (ip, success, attempted_at)`, and refuses with a lockout message when the IP has 5 or more failed attempts in the last hour. A successful login inserts a `success=true` row and deletes that IP's failed rows.

### 5.5 Where server-side guards are, and where they are not

This is the most important thing for a migrating engineer to know about the security posture.

**Guarded server actions** (they check the caller before mutating):

- Everything in `app/actions/reactivation.ts` that touches account data calls `getCurrentParticipant()` and scopes by `accessOwnerId(participant)`; owner-only actions additionally check `participant.role === 'owner'` (`setDefaultNiche`, `setCallBatchSize`, `addTeamMember`, `setTeamMemberActive`, `updateTeamMember`, `bulkDeleteContacts`, `bulkAssignNiche`).
- `app/actions/payments.ts`: `createPaymentLink`, `listPaymentLinks`, `getPaymentLink`, `deletePaymentLink`, `provisionAccountsNow` call a local `requireAdmin()` that validates the `tp_admin` cookie and throws otherwise.
- `app/actions/demo.ts`: `resetDemo`, `refreshDemoIfStale`, `switchDemoView` require the current participant to have `is_demo = true`.
- `app/api/admin/emails/export/route.ts` validates `tp_admin`.
- `app/api/cron/demo-reset/route.ts` validates the `CRON_SECRET` bearer.
- `app/api/progress/route.ts`, `app/api/templates/contacts/route.ts`, `app/api/media/route.ts` (without `admin=1`) require `tp_session`.

**Unguarded server actions** (they rely only on the fact that the UI that calls them lives behind `/admin` in `proxy.ts`):

- All of `app/actions/admin.ts`: `createCourse`, `updateCourse`, `deleteCourse`, `createModule`, `updateModule`, `deleteModule`, `moveModule`, `createVideo`, `updateVideo`, `deleteVideo`, `moveVideo`, `addAttachment`, `deleteAttachment`, `createParticipant`, `updateParticipant`, `deleteParticipant`, `setCourseAccess`, `setNicheAccess`.
- The admin-only functions at the top of `app/actions/reactivation.ts`: `createNiche`, `updateNiche`, `deleteNiche`, `updateMasterScript`, `saveScriptSection`.

Next.js server actions are POST endpoints addressed by an action ID; `proxy.ts` only matches page paths, so these could in principle be invoked without the admin cookie by someone who extracts the action ID from the admin bundle. Recommended first hardening step after migration: add the same `requireAdmin()` check to every function in `admin.ts` and the five admin functions in `reactivation.ts`.

**Unauthenticated endpoints by design (documented in code comments as "admin area is unauthenticated for now")**:

- `POST /api/upload` (legacy server-side upload to Blob).
- `POST /api/upload/token` (issues direct-upload tokens; restricts pathnames to `videos/`, `attachments/`, `thumbnails/`, max 5 GB).
- `GET /api/media?pathname=…&admin=1` skips the session check. Anyone who knows a Blob pathname (they contain a random suffix, so they are not guessable) can stream it by appending `admin=1`.

### 5.6 PHI posture

`contacts`, `reactivation_calls`, and `follow_ups` contain real patients' names, phone numbers, treatment history (`original_complaint`), and call notes for HIPAA covered entities. Reactivation Power is a Business Associate. No admin page renders individual patient rows (admin sees only aggregate counts). Raw CSVs are parsed in the browser and never stored; only mapped rows are sent to the server. GoHighLevel receives only *office-owner* lead data, never patients. At the time of writing: 142 contacts, of which 100 belong to the demo account and 42 are real.

---

## 6. Database schema

Supabase project `jbdymqqpolkoevyypjxd`, schema `public`. All primary keys are `uuid DEFAULT gen_random_uuid()`. All timestamps are `timestamptz`. RLS is enabled on every table with no policies. Row counts are as of the audit and will drift.

### 6.1 Identity and sessions

**`participants`** (20 rows: 11 owners, 9 staff; 5 of these are demo) — every human who can sign into the portal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `first_name`, `last_name` | text NOT NULL | |
| `email` | text NOT NULL **UNIQUE** | Login key, always stored lowercase |
| `phone` | text | |
| `parent_id` | uuid → `participants.id` ON DELETE CASCADE | NULL for owners; the owner's id for staff. Deleting an owner deletes their staff |
| `role` | text NOT NULL DEFAULT `'owner'` CHECK IN (`'owner'`,`'staff'`) | |
| `is_active` | bool NOT NULL DEFAULT true | Inactive participants cannot log in and do not count toward the staff cap |
| `selected_niche_id` | uuid → `niches.id` SET NULL | Last niche the caller picked in the script viewer / call screen |
| `default_niche_id` | uuid → `niches.id` SET NULL | Owner setting: niche assigned to imported contacts that resolve to nothing else |
| `practice_name` | text | Fills `{{practice_name}}` in scripts |
| `office_phone` | text | Callback number read in the voicemail script |
| `practice_phone` | text | Legacy column, unused by current code |
| `is_business_owner` | bool | Legacy column, unused by current code |
| `call_batch_size` | int NOT NULL DEFAULT 7 | Allowed 5/7/10 (`CALL_BATCH_SIZES`) |
| `is_demo` | bool NOT NULL DEFAULT false | Marks the Ridgeline demo owner and its 4 callers |
| `demo_seeded_at` | timestamptz | Demo owner only: when the fake data was last rebuilt |
| `demo_seed_started_at` | timestamptz | Demo owner only: rebuild lock (section 17) |
| `created_at` | timestamptz | |

**`participant_aliases`** (15 rows) — when someone logs in with the right email but a different name/phone than the record, the variation is recorded here. UNIQUE (`participant_id, first_name, last_name, phone`). Columns: `participant_id` (CASCADE), `first_name`, `last_name`, `phone`, `ip_address`, `first_seen_at`, `last_seen_at`, `login_count`.

**`sessions`** (214 rows) — one row per login, for analytics. Columns: `participant_id` (CASCADE), `ip_address`, `user_agent`, `started_at`, `last_active_at` (bumped by every `/api/progress` heartbeat). The session id is embedded in the cookie so events can be attributed.

**`admin_login_attempts`** (20 rows) — `ip`, `attempted_at`, `success`. Lockout bookkeeping only.

### 6.2 Training content

**`courses`** (2 rows: `ppl-training` "Reactivation Power Training - Healthcare", `home-services-training` "Reactivation Power Training - Home Services", both `live`).

| Column | Notes |
|---|---|
| `title`, `description` | |
| `slug` text UNIQUE | URL segment `/portal/course/<slug>`; generated by `slugify(title)` with a base-36 timestamp suffix on collision |
| `thumbnail_url` | Blob pathname or NULL (currently NULL for both) |
| `status` CHECK IN (`draft`,`live`) | Learners only see `live` |
| `sort_order` | |
| `sector` text NOT NULL DEFAULT `'healthcare'` | `'healthcare'` or `'home_services'`; drives the owner's sectors (section 8) |

**`modules`** (10 rows) — `course_id` → courses CASCADE, `title`, `description`, `status` (draft/live), `sort_order`.

**`videos`** (36 rows) — `module_id` → modules CASCADE, `title`, `description`, `video_url` (Blob pathname under `videos/`; 33 set), `duration_seconds` numeric, `thumbnail_url` (Blob pathname under `thumbnails/`; 22 set), `status` (draft/live), `sort_order`.

**`attachments`** (0 rows currently) — `video_id` → videos CASCADE, `module_id` → modules CASCADE (either may be set; current UI attaches to videos), `file_url` (Blob pathname under `attachments/`), `file_name`, `file_size`, `file_type`.

**`course_access`** (10 rows) — `course_id` + `participant_id` (both CASCADE), UNIQUE pair. Rows exist only for **owners**; staff inherit (section 8).

**`video_progress`** (83 rows) — UNIQUE (`participant_id`, `video_id`). `seconds_watched` numeric (accumulated), `furthest_position` numeric (max position seen), `percent_watched` numeric (0–100, based on furthest/duration), `completed` bool, `completed_at`, `updated_at`. Upserted by `/api/progress`.

**`activity_events`** (376 rows) — append-only log. `participant_id` (CASCADE), `session_id` (SET NULL), `course_id`/`module_id`/`video_id` (SET NULL), `event_type` CHECK IN (`login`, `video_start`, `video_progress`, `video_complete`, `attachment_download`, `module_unlock`), `metadata` jsonb, `ip_address`, `created_at`. Written by `logEvent()` in `lib/data/activity.ts`. In practice the app emits `login`, `video_start`, `video_complete` (and the demo seeder writes synthetic ones); the other types are defined but not currently emitted.

### 6.3 Reactivation: catalog and scripts

**`niches`** (24 rows) — the service catalog. `name` (exact names are used as keys in code, see 10.3), `sort_order`, `is_active` (23 active; "Med Spa" is inactive), `sector` (`healthcare` ×22, `home_services` ×2: HVAC, Plumbing).

Current healthcare niches (sort order): Chiropractic, ChiroThin, Weight Loss (Not ChiroThin), Red Light / Body Contouring, Decompression, Neuropathy, Acoustic Wave Therapy, Joint Pain, Gut Health, Massage Therapy, Acupuncture, Botox, Teeth Whitening, Cellulite Reduction, Skin Tightening, Clear Aligners, Orthodontics / Braces, Body Waxing, Laser Hair Removal, GLP Patients, Dental Implants, Med Spa (inactive).

**`script_flow_steps`** (552 rows: 18 shared with `niche_id NULL`, 534 niche-specific across 23 niches) — one row = one screen of the branching call script.

| Column | Notes |
|---|---|
| `niche_id` uuid → niches CASCADE, nullable | NULL = the shared/default screen for that `step_key` |
| `step_key` text | e.g. `open`, `opening_question`, `making_it_real`, `review`, `bridge_no`, `recommendation`, `uncover`, `obj_cost`, `obj_think`, `scheduling`, `mode_parent_*`, `making_it_real_nw` |
| `title` | Screen heading |
| `content` | Plain text spoken by the caller, with `{{tokens}}`. Director notes are in parentheses. **No markdown, no em dashes** (product rule) |
| `sort_order` | Determines the start step (lowest `sort_order` among resolved steps) |
| `updated_at` | |

Shared step keys in order: `open, opening_question, resp_doing_great, resp_coming_back, resp_fully_back, doing_well_variant, transition, digging_in, making_it_real, review, recommendation, uncover, obj_taken_care_of, obj_cost, obj_other_option, obj_time, obj_spouse, scheduling`.

**`script_flow_choices`** (1,322 rows: 36 shared, 1,286 niche-specific) — one row = one tappable button ("what the patient said") on a screen.

| Column | Notes |
|---|---|
| `niche_id` nullable → niches CASCADE | NULL = shared button set for that `from_step_key` |
| `from_step_key` | The screen this button appears on |
| `label` | Button text |
| `to_step_key` nullable | Destination screen; NULL = terminal |
| `variant` DEFAULT `'default'` | One of `default, positive, caution, negative, objection` (controls button color) |
| `sort_order` | |

**`script_dedash_backup_20260911`** (1,874 rows; `kind, id, title, content, label`) — a one-off backup of step/choice text taken before a bulk em-dash removal on 2026-09-11. Not read by any code. Kept until the owner finishes reviewing the rewrite, then drop it.

**`reactivation_scripts`** (1 row) and **`script_sections`** (84 rows) — the **legacy linear master script** system: one `body` with `{{slot}}` placeholders (`opening_hook`, `reason_for_visit`, `offer_details`, `objection_handler`) and per-niche content per slot (UNIQUE `niche_id, slot_name`). Still editable at `/admin/reactivation` and still loaded by the call page, but the call screen renders it **only if `script_flow_steps` is empty**, which never happens in production. It is effectively dormant. See 10.6.

### 6.4 Reactivation: account data

**`contacts`** (142 rows) — patients/customers on an account's list.

| Column | Notes |
|---|---|
| `owner_id` uuid NOT NULL → participants CASCADE | The account. Always the owner's id even when a staff member created the row |
| `created_by` → participants SET NULL | The participant who added/imported it |
| `name` text NOT NULL | Full name; `contact_first_name` token is `name.split(' ')[0]` |
| `phone` text NOT NULL | Stored as typed; dedupe uses digits only |
| `email` | |
| `niche_id` → niches SET NULL | Which script this contact gets. May reference a niche the account has NOT enabled (section 11.3) |
| `stage_id` → pipeline_stages SET NULL | |
| `do_not_call` bool DEFAULT false | Set by the `do_not_call` disposition; excluded from all queues |
| `notes` text | Sanitized HTML from the TipTap editor |
| `first_call_at` timestamptz | Set on first logged call; anchors the 2-month retry window |
| `service_label` text | Raw "Last Service" value from the CSV |
| `original_complaint` text | "Previously Treated For"; feeds `{{complaint_reference}}` |
| `created_at` | Import order matters: reserve release is oldest-first |

**`pipeline_stages`** (5 rows) — `owner_id` nullable → participants CASCADE (NULL = global default), `name`, `sort_order`, `is_default`. Global defaults: New (0), Contacting (1), Spoke To (2), Scheduled (3), Recall (4). Owners can add their own. `logCall` moves contacts between stages by **lowercase name match** (`contacting`, `spoke to`, `scheduled`).

**`reactivation_calls`** (205 rows) — one row per logged call. `contact_id` → contacts CASCADE, `caller_id` → participants SET NULL, `disposition` CHECK IN (`no_answer, voicemail, spoke_did_not_schedule, spoke_call_back_later, scheduled, do_not_call`), `voicemail_left` bool, `notes`, `appointment_at` (only for `scheduled`), `created_at`.

**`follow_ups`** (230 rows) — the queue. `contact_id` → contacts CASCADE, `due_at`, `reason` CHECK IN (`retry, three_month, quarterly, manual, initial`), `completed_call_id` → reactivation_calls SET NULL (NULL = **open**; set when the next call is logged), `created_at`. A contact's "next follow-up" is its earliest open row.

**`service_niche_mappings`** (10 rows) — UNIQUE (`owner_id`, `service_label`). Learned during CSV import: "when this account's file says `service_label` (lowercased), use `niche_id` (nullable = account default)". Pre-fills the mapping step on the next upload.

**`niche_access`** (177 rows) — `participant_id` + `niche_id` (both CASCADE), UNIQUE pair. Rows exist only for owners. Mirrors `course_access`.

### 6.5 Sales and marketing

**`landing_leads`** (31 rows) — every `/healthcare` (and `/schedule-a-call`) form submission. `sector`, `first_name`, `last_name`, `email`, `phone` (formatted `(xxx) xxx-xxxx`), `practice_name`, `source_path`, `years_in_practice`, `inactive_patients_estimate` (exact count as text), `services text[]` (internal niche names), `zip`, `city`, `state`, `consent` bool, `consent_ip`, `ghl_contact_id`.

**`payment_links`** (2 rows) — `token` text UNIQUE (base64url random, the URL secret), `name`, `email`, `phone`, `staff` jsonb `[{name,email}]` (max 5), `amount_cents` int CHECK > 0, `status` CHECK IN (`pending`,`paid`), `stripe_session_id`, `paid_at`, `participant_id` → participants SET NULL (the provisioned owner), `provisioned_at`.

### 6.6 Delete-cascade summary

Deleting a **participant** (owner) cascades to: their staff (`parent_id`), their `contacts` (and from there `follow_ups` and `reactivation_calls`), `sessions`, `activity_events`, `participant_aliases`, `video_progress`, `course_access`, `niche_access`, `pipeline_stages` (custom), `service_niche_mappings`. `payment_links.participant_id` and `reactivation_calls.caller_id` are set NULL.

Deleting a **course** cascades to modules → videos → attachments, video_progress, course_access; activity_events references are set NULL. Blob files are **not** deleted automatically; see 9.6.

Deleting a **niche** cascades to its `script_flow_steps`, `script_flow_choices`, `script_sections`, `niche_access`, `service_niche_mappings`; `contacts.niche_id` and `participants.*_niche_id` are set NULL.

---

## 7. Identity, accounts, sessions, and login

### 7.1 Account model

An **account** is one owner participant plus zero to five active staff participants (`MAX_STAFF = 5` in `lib/types.ts`; inactive staff do not count, so deactivating frees a seat). Everything account-scoped (contacts, follow-ups, calls, niche access, course access, stages, service mappings, practice name, office phone, default niche, batch size) hangs off the **owner's** participant id.

The single most important helper is in `lib/data/participants.ts`:

```ts
export function accessOwnerId(participant: Participant): string {
  return participant.parent_id ?? participant.id
}
```

Every portal page and every account-scoped server action does `const ownerId = accessOwnerId(participant)` and filters by it. Staff therefore see exactly their owner's data. Owner-only UI and actions additionally check `participant.role === 'owner'`.

`getCurrentParticipant()` reads the `tp_session` cookie, decodes it, loads the participant by id, and returns `null` if missing or inactive.

### 7.2 Portal login (`/login` → `app/actions/auth.ts` `login()`)

There are **no passwords** for portal users. The form asks for first name, last name, email, optional phone.

1. Email is normalized (trim + lowercase) and looked up in `participants`. If not found or `is_active = false` → error "This email is not registered."
2. If the submitted name/phone differ from the record, upsert a `participant_aliases` row (increment `login_count`, record IP).
3. Insert a `sessions` row (IP, user agent).
4. `logEvent({ eventType: 'login', metadata: { submitted_*, name_match, phone_match } })`.
5. Set `tp_session` with `{ participantId, sessionId, issuedAt }`.
6. Redirect to `next` (must start with `/`) or `/portal`.

`logout()` deletes the cookie and redirects to `/login`. (Note: the admin sidebar's Sign Out button also calls this `logout()`, which clears `tp_session`, not `tp_admin`. `adminLogout()` exists in `admin-auth.ts` but is not wired to the sidebar. The admin cookie simply expires after 7 days.)

### 7.3 How participants get created

| Path | Code | Result |
|---|---|---|
| Admin "Add Participant" / "Add staff" | `createParticipant()` in `app/actions/admin.ts` (via `components/admin/new-participant-dialog.tsx`, `components/admin/add-staff-form.tsx`) | Owner (no `parentId`) or staff (`parentId` set, role `staff`, cap enforced) |
| Owner self-service "Add caller" | `addTeamMember()` in `app/actions/reactivation.ts` (via `components/reactivation/add-caller-dialog.tsx`, `team-manager.tsx`) | Staff under the current owner only; cap enforced; owner can also `setTeamMemberActive` and `updateTeamMember`, always guarded by `.eq('parent_id', participant.id)` |
| Stripe payment | `provisionAccounts()` in `app/actions/payments.ts` | Buyer → owner, each staff email → staff; idempotent (section 19) |
| Demo seeder | `ensureDemoParticipants()` in `lib/demo/seed.ts` | 1 owner + 4 callers with `is_demo = true` |

Owners edit their own record via `updateMyProfile()` (`components/portal/my-profile-form.tsx`). Emails must stay unique (Postgres error `23505` is mapped to a friendly message).

---

## 8. Entitlements: courses, niches, and sectors

Two mirror-image join tables gate content per account. Both are keyed by the **owner's** participant id; staff inherit through `accessOwnerId`.

**Courses** — `course_access(course_id, participant_id)`. `getAccessibleCourseIds(ownerId)` → `getAccessibleCourses(ownerId)` (live courses only). Toggled by admin on `/admin/participants/[id]` via `setCourseAccess()` (`components/admin/course-access-toggle.tsx`).

**Niches** — `niche_access(participant_id, niche_id)`. `getAccessibleNicheIds(ownerId)`; `getOwnerNiches(ownerId, sectors?)` = globally active niches (optionally filtered to the account's sectors) ∩ the account's access rows. Toggled by admin via `setNicheAccess()` (`components/admin/niche-access-toggle.tsx`, grouped by sector). New accounts start with **zero** niches (the portal shows "No niches enabled for this account"); sales enables only what was purchased. A brand-new niche added to the catalog is disabled for everyone until toggled on.

**Sectors** — there is no `sector` column on participants. `getOwnerSectors(ownerId)` in `lib/data/courses.ts` derives the account's sectors from the `sector` of the courses it has access to, falling back to `['healthcare']` when it has none. Sectors drive: which niches appear in pickers, the wording "patient/practice/EHR" vs "customer/business/CRM" throughout the portal, and which niches the CSV importer can resolve.

---

## 9. Training system

### 9.1 Content hierarchy

`courses → modules → videos → attachments`, each with `sort_order` and (except attachments) a `draft|live` status. `getCourseTree(courseId, liveOnly)` in `lib/data/courses.ts` assembles the nested structure with three queries (course, modules, videos in those modules). Learner pages pass `liveOnly = true`; the admin editor passes `false` to see drafts.

### 9.2 Where the files are: Vercel Blob (private)

All binaries are in one **private** Vercel Blob store. Pathname convention: `<kind>s/<sanitized-original-filename>-<random-suffix>.<ext>` where kind ∈ `video | attachment | thumbnail`. The sanitizer is `name.replace(/[^a-zA-Z0-9._-]/g, '_')`; `addRandomSuffix: true` makes pathnames unguessable. Only the pathname is stored in Postgres.

Because the store is private, `https://<store>.public.blob.vercel-storage.com/...` URLs do not work. This is also why marketing email images are served from `public/images/emails/` on the site domain rather than from Blob (section 20).

### 9.3 Upload path (admin)

Two mechanisms exist; the first is the one the UI uses.

**Direct browser → Blob (current).** `lib/upload-client.ts` `uploadFileWithProgress(file, kind, onProgress)` calls `@vercel/blob/client` `upload()` with `handleUploadUrl: '/api/upload/token'`, `access: 'private'`, and `multipart: file.size > 20 MB`. The route handler `app/api/upload/token/route.ts` runs `handleUpload()` from `@vercel/blob/client`: in `onBeforeGenerateToken` it rejects any pathname not starting with `videos/`, `attachments/`, or `thumbnails/`, and sets `maximumSizeInBytes` to 5 GB. There is deliberately **no `onUploadCompleted` callback**: the client saves the returned pathname to the database itself afterward (a callback URL would break in preview environments). The file never touches a Vercel function, which is required because serverless request bodies are capped at ~4.5 MB.

`lib/upload-manager.ts` is a tiny external store (`useSyncExternalStore`) that lets an upload outlive the dialog that started it, shows progress in the floating `components/admin/upload-tray.tsx`, warns on `beforeunload` while uploads are active, and swallows the known transient `TypeError: network error` unhandled rejections that `@vercel/blob`'s multipart retry leaks.

**Server-side upload (legacy).** `POST /api/upload?kind=&name=` accepts a raw body (or multipart for backward compatibility) and `put()`s it. Kept for compatibility; not used by current UI.

Video save flow in the admin (`components/admin/upload-video-dialog.tsx`, `video-row.tsx`, `thumbnail-dialog.tsx`): read duration client-side with `readVideoDuration(file)`; upload the video; optionally auto-capture a thumbnail with `captureFrameFromSource(objectUrl, 1.5s)` (canvas → JPEG, max 1280 px wide) and upload it as `kind = 'thumbnail'`; then call `createVideo()` / `updateVideo()` with `videoUrl`, `thumbnailUrl`, `durationSeconds`.

### 9.4 Read path: the media proxy

`lib/media.ts`:

```ts
mediaUrl(pathname)      → `/api/media?pathname=<enc>`           // portal (requires tp_session)
adminMediaUrl(pathname) → `/api/media?pathname=<enc>&admin=1`   // admin (no auth check)
```

`GET /api/media` (`maxDuration = 300`) calls `@vercel/blob` `get(pathname, { access: 'private', headers: { Range } })`, forwards the browser's `Range` header so `<video>` can seek, and responds `206 Partial Content` with `Content-Range`/`Content-Length` when partial, `200` otherwise, plus `ETag`, `Accept-Ranges: bytes`, `Cache-Control: private, no-cache`. `?download=<filename>` adds `Content-Disposition: attachment` (used by `components/portal/attachment-list.tsx`). `If-None-Match` is honored for non-range requests (304).

### 9.5 Playback, progress, completion, and locking

`components/portal/video-player.tsx` renders a native `<video src={mediaUrl(videoPathname)} poster={mediaUrl(thumbnail)}>` and POSTs to `/api/progress` every **10 seconds** (`HEARTBEAT_INTERVAL`) and on `start` / `ended`, with `{ videoId, courseId, moduleId, position, duration, secondsDelta, event }`.

`app/api/progress/route.ts` (requires `tp_session`):

1. Loads the existing `video_progress` row for (participant, video).
2. `furthest = max(existing.furthest_position, position)`; `seconds_watched += clamp(secondsDelta, 0, 60)`; `percent = round(furthest / duration * 100)`.
3. `completed = wasCompleted || event === 'ended' || percent >= 90` (`COMPLETION_THRESHOLD = 90`).
4. Upserts on `(participant_id, video_id)`; bumps `sessions.last_active_at`.
5. Logs `video_start` on the first heartbeat ever for that video, and `video_complete` the first time it flips to completed.
6. Returns `{ completed, percent, justCompleted }` so the player can reveal the "Next video" button.

Locking is computed, not stored, by `computeCourseState(tree, progress)` in `lib/data/progress.ts`:

- Module N is locked until **every** video in module N-1 is completed. Modules with zero videos never block.
- Within a module, video N is locked until video N-1 is completed.
- Returns per-module and per-video `{ locked, completed, percentWatched, furthestPosition }` plus overall `percentComplete`.

The video page (`app/portal/course/[slug]/video/[videoId]/page.tsx`) enforces this server-side: it redirects to the course page if the requested video is locked, redirects to `/portal` if the account lacks `course_access`, and 404s if the course is not `live`.

### 9.6 Deleting content

`deleteVideo` / `deleteCourse` / `deleteAttachment` delete Postgres rows only. **Blob objects are orphaned, not deleted.** If storage cost matters after migration, add a `del(pathname)` call from `@vercel/blob` in those actions or run a periodic sweep comparing `list()` against the three `*_url` columns.

---

## 10. Reactivation system, part 1: niches and the script engine

### 10.1 What a "niche" is

A niche is one service line with its own call script: Chiropractic, Botox, HVAC, etc. Its `name` in the `niches` table is used as a literal key in three code files (10.3). Renaming a niche in the admin therefore requires updating those keys.

### 10.2 The branching script: fully database-driven

The caller never reads a long document. They see one **screen** (a `script_flow_steps` row) at a time and tap a **button** (a `script_flow_choices` row) describing what the patient said, which routes to the next screen. The player component is `components/reactivation/script-flow-player.tsx`. It is completely generic: adding a screen, a branch, an objection, or an entire niche is pure data insertion. No component changes are needed as long as the new niche's name has entries in the three code tables below if it needs concern chips.

**Loading.** `getScriptFlow()` in `lib/data/reactivation.ts` loads **all** steps and **all** choices for every niche in one go using `fetchAllRows()`, which pages through PostgREST in 1,000-row chunks ordered by `(sort_order, id)`. This pagination is essential: `script_flow_choices` has 1,322 rows and the default PostgREST cap is 1,000 rows per request. Before this fix, every choice with `sort_order ≥ 5` was silently dropped across every niche. **Any future full-table read of either script table must paginate.**

**Resolution per niche (inside the player, `useMemo` on `nicheId`).**

- `stepMap`: first take every shared step (`niche_id IS NULL`), then overwrite with every step whose `niche_id === nicheId`. A niche row with the same `step_key` **replaces** the shared one.
- `choiceMap`: keyed by `from_step_key`. Shared choices fill the map first. If the niche has **any** choice for a given `from_step_key`, the niche's set **replaces** the shared set for that screen (it does not merge). Practical consequence: to add one niche-specific button to a screen that has shared buttons, you must re-insert the shared buttons as niche rows too, or they vanish for that niche.
- `startKey`: the `step_key` of the resolved step with the lowest `sort_order` (in practice `open`).
- `initialStepKey` prop (from the `?screen=` deep link on the practice page) overrides the start when valid.

**Navigation.** The player keeps a `trail` (array of visited step keys) for a Back button, and records `making_it_real` in the trail even when the `making_it_real_nw` variant is displayed so Back works.

### 10.3 Tokens: how `{{placeholders}}` get filled

The step `content` contains `{{token}}` placeholders. Values come from three sources, merged in the player:

**(a) `extras` built by `components/reactivation/call-screen.tsx`** from the contact and account:

| Token | Value |
|---|---|
| `contact_first_name` | `contact.name.split(' ')[0]` |
| `contact_full_name` | `contact.name` |
| `caller_name`, `your_name` | signed-in participant's first name |
| `practice_name` | `owner.practice_name` (unset → token left for fallback) |
| `provider_name` | `Dr. {owner.first_name} {owner.last_name}`, else `practice_name` |
| `rec_pronoun` / `rec_pronoun_cap` / `rec_obj` / `rec_poss` | `I / I / me / my` when the caller is the owner (`isProvider`), else `we / We / us / our` |
| `asked_by_provider` | `"I wanted to reach out to you personally."` for the owner; `"{provider_name} asked me to reach out to you personally."` for staff |
| `complaint_reference` | `spokenComplaint(contact.original_complaint)` from `lib/script-merge.ts`: lowercases (unless it looks like an acronym) and prepends "the" if there is no leading article, so "Lower Back Pain" → "the lower back pain". Only set when the contact has a documented complaint |

**(b) Concern chips (`{{main_concern}}`).** `lib/concern-options.ts` exports `CONCERN_OPTIONS: Record<nicheName, ConcernOption[]>` (15 niches have chips) and `CONCERN_FALLBACK = "what's been bothering you the most"`. The call screen passes `CONCERN_OPTIONS[nicheName]` to the player; on the questions screen the caller taps the chip matching what the patient said, which fills `{{main_concern}}` for the rest of the call. Each `ConcernOption` has `label`, `spoken`, and for ChiroThin / Weight Loss (Not ChiroThin) a `weightRelated` boolean: tapping a `weightRelated: false` chip makes the player swap `making_it_real` for `making_it_real_nw` and swaps the weight objections for the `obj_nw_*` steps. The questions screen always shows an "original complaint" chip first (documented → "Lower back pain (original)"; undocumented → generic "Original complaint" speaking the fallback phrase).

**(c) Parent/guardian mode (`{{pt_*}}` tokens).** `PATIENT_TOKENS` and `PARENT_TOKENS` are constant maps inside the player (`pt_you`, `pt_your`, `pt_them`, `pt_get_you_in`, `pt_obj_braces_q`, … about 25 keys). Parent mode is ON when the trail contains any step whose key starts with `mode_parent` (Orthodontics and Clear Aligners have a "who is on the phone" screen that routes there). Same script text, two renderings.

**Fallbacks (product rule: the caller must never see a raw bracket).** For `{{complaint_reference}}` with no documented complaint: `stripComplaintClause()` removes the whole ", especially with {{complaint_reference}}" clause on the opener; mid-sentence occurrences fall back to `COMPLAINT_FALLBACK = "what you originally came in for"`. For `{{main_concern}}` with no chip tapped: `CONCERN_FALLBACK`. Unknown tokens render as `[TOKEN NAME]` in uppercase (from `mergeScript`), which is how missing data is spotted during practice.

### 10.4 Voicemail chip

On the start step only, when `showLeaveVm` is true (every **second** attempt: `attemptNumber = callHistory.length + 1; showLeaveVm = attemptNumber % 2 === 0`), the player shows a "No answer? Leave a voicemail" chip. Clicking it opens a dialog in the call screen with a fixed voicemail script merging `firstName`, `callerName`, `practiceName`, and `officePhone`, and a "Log: Voicemail Left" button that submits disposition `voicemail` with `voicemail_left = true`. A plain "No Answer" disposition logs directly with no voicemail prompt.

### 10.5 Where the script is used

- **Live call**: `/portal/dialer/call/[contactId]` → `CallScreen` → `ScriptFlowPlayer` with real contact data.
- **Practice**: `/portal/dialer/script` (also reachable from a course page as `?from=course&course=<slug>`) → `components/reactivation/script-viewer.tsx` → `ScriptFlowPlayer` with placeholder tokens; niche picker persists via `setSelectedNiche()` to `participants.selected_niche_id`; `?screen=<step_key>` deep-links to a screen.
- Font size is user-adjustable (`FONT_SIZES` 16–40 px) on both.

### 10.6 The legacy master script (dormant)

`reactivation_scripts` (one row, `body` with `{{opening_hook}}`, `{{reason_for_visit}}`, `{{offer_details}}`, `{{objection_handler}}`) plus `script_sections` (per-niche slot content) are merged by `mergeScript(body, sections, extras)` in `lib/script-merge.ts`. The call screen computes this merge and renders it as paragraphs **only when `flowSteps.length === 0`**. With 552 flow steps live, this branch never executes. The admin page `/admin/reactivation` still exposes the Master Script and Niche Sections editors (`updateMasterScript`, `saveScriptSection`). A migration can drop this subsystem entirely, or keep it as an emergency fallback.

### 10.7 Script content conventions (product rules you must preserve when editing data)

- No em dashes anywhere in script text or portal UI strings (a reader said they looked AI-written). Use periods, commas, colons, question marks.
- Every non-parenthetical line is read aloud verbatim; director notes go in parentheses. No section labels like "How long:".
- No normalizing phrases ("really common", "completely normal"); preferred substitute "that can happen from time to time".
- Recommendation screens follow a fixed sequence: stakes question naming `{{main_concern}}` → printed pivot for hesitation → "can I make a recommendation?" → recommendation, then the honesty pledge → "Does that sound reasonable?" (never "sound good"). HVAC/Plumbing are exempt.
- Avoid the word "today" in commitments ("You're not committing to anything today" is banned).
- Small-anchor phrasing for how-long/how-often questions ("a few days, a few weeks, or longer than that?").
- Every healthcare niche must expose the universal objections `obj_think`, `obj_send_info`, `obj_other_option` plus a Review & Bridge (`review` → `bridge_no`) path. HVAC/Plumbing are out of scope for healthcare objection work.

---

## 11. Reactivation system, part 2: contacts, CSV import, pipeline stages

### 11.1 Adding one contact

`components/reactivation/add-contact-dialog.tsx` → `createContact()` (owner-scoped; validates name + phone, optional email/niche/notes/complaint; assigns the first global stage). `updateContact()` edits (notes sanitized by `sanitizeNotes()` in `lib/notes-html.ts`). `deleteContact()`, `bulkDeleteContacts()` (owner only), `bulkAssignNiche()` (owner only). Contact detail page: `/portal/contacts/[id]` (`components/reactivation/contact-editor.tsx`, `delete-contact-button.tsx`).

### 11.2 CSV import pipeline

Everything up to the final server call happens in the browser inside `components/reactivation/import-contacts-dialog.tsx` (1,284 lines). The raw file is **never uploaded**.

1. **Upload step**: parse CSV client-side. A file with headers but zero data rows errors immediately. A collapsible panel lists the account's exact valid niche names. Download links to the personalized template `/api/templates/contacts?variant=niche|services` (authed route in `app/api/templates/contacts/route.ts`, one realistic sample row per enabled niche, with static fallback `public/templates/contact-import-template.csv`).
2. **Columns step**: `detectColumns()` maps headers to roles with `STRICT_PATTERNS` (anchored regexes) then `LOOSE_PATTERNS` (contains-style), using a `claimed` set so one column cannot fill two roles. Roles: name / first / last, phone (mobile/cell preferred over home/work), email, service ("Last Service", "Appointment Type", …), complaint ("Complaint", "Condition", "Treated For", "Diagnosis", "Concern"), notes, niche (`niche|niche name|script|script type|campaign|category|patient type|patient category|treatment category|service line|specialty|segment|tag`). Everything is hand-remappable. A live grouped preview shows how each Niche value resolves (matched / real-but-not-enabled in red / unrecognized in red / blank count).
3. **Services step** (only when there is a service column and no Niche column): each distinct service label gets a dropdown pre-filled from `service_niche_mappings` or from `suggestNicheForService()`; unrecognized labels are left **unset** with a destructive border and a banner (never silently defaulted, so the user notices).
4. **Server**: `importContacts({ rows, mappings, forceNicheId })` in `app/actions/reactivation.ts`.

`importContacts` logic, in order:

- Cap at `MAX_IMPORT_ROWS = 5000`.
- Upsert `service_niche_mappings` for this owner (skipped for the demo account).
- Load `default_niche_id` and the first global stage (New).
- Validate `forceNicheId` against active niches.
- If any row has a Niche value, load `getOwnerNiches(ownerId)` and `getNiches(true)` (all active).
- Dedupe key = `normalizePhone()` (digits only, strip leading 1 from 11-digit numbers); skip rows with no name or fewer than 7 digits (`skippedInvalid`), skip phones already in the account or earlier in the file (`skippedDuplicate`).
- **Niche precedence per row**: `forcedNicheId ?? rowNicheId ?? mappedFromService ?? defaultNicheId`, where `rowNicheId` comes from `matchNicheByName(raw, ownerNiches)`; if that fails but `matchNicheByName(raw, allActiveNiches)` succeeds, the contact is stored with its **true** niche anyway and the canonical name is returned in `notEnabledNiches` (UI: "Some niches in your file aren't turned on for this account… contact the Reactivation Power team"); if both fail the raw value is returned in `unmatchedNiches` (typo).
- Insert in chunks of 250 with `owner_id`, `created_by`, `stage_id`, `service_label`, `original_complaint`.
- **No `follow_ups` are created.** Imported contacts land in the reserve pool (section 12).
- Demo account: runs the whole pass and returns `{ simulated: true }` without writing.

`lib/niche-match.ts` is the matcher used by both the importer and the template route: `matchKey()` flattens all non-alphanumerics to spaces (so "Red-Light", "red_light", "RED/LIGHT" all match), `matchNicheByName()` tries an exact normalized name match first and then a keyword rule table (`shockwave|softwave|gainswave → Acoustic Wave Therapy`, `invisalign → Clear Aligners`, `semaglutide|glp → GLP Patients`, `chirothin`, then `weight loss → Weight Loss (Not ChiroThin)`, `a c|hvac|furnace → HVAC`, etc.); keywords of ≤3 chars or containing single-letter tokens require whole-word matches so "Spa Care Package" never matches HVAC's `a c`.

### 11.3 The "niche not active" flag

`ContactWithMeta.niche_active` (computed in `getContacts` / `getContact`) is false when `contact.niche_id` is set but not in `getOwnerNiches(ownerId)`. Consequences: red lock chip "{Niche}: not active" in the queue and the contacts table, the Start Call link is disabled, and the call page renders a destructive card instead of the script (server-side, so direct URLs are blocked too). Enabling the niche in the admin makes the contact callable with the right script with no re-import ("self-heals").

### 11.4 Pipeline stages

`getPipelineStages(ownerId)` returns global (`owner_id IS NULL`) plus the owner's custom stages. Owners manage custom stages via `createStage`, `moveStage`, `deleteStage` (`components/reactivation/stage-manager.tsx`). Stage transitions are automatic in `logCall` (section 13.3).

---

## 12. Reactivation system, part 3: the call queue and batch release

### 12.1 Vocabulary

- **Open follow-up**: a `follow_ups` row with `completed_call_id IS NULL`. A contact's `next_follow_up` is its earliest open row (computed in `getContacts`).
- **Released**: the contact has an open follow-up.
- **Reserve / waiting**: `!do_not_call && !next_follow_up && !first_call_at`, i.e. imported, never called, not yet released.
- **Batch size**: `participants.call_batch_size` (5/7/10, default 7), owner-settable via `setCallBatchSize()` (`components/reactivation/batch-size-select.tsx`).

### 12.2 `getCallQueueState(ownerId, batchSize)` in `lib/data/reactivation.ts`

Called by the Dialer page on every load. Returns `{ followUps, newCalls, waiting, batchSize }`.

1. Read all contacts **once** (`getContacts`).
2. Base queue = contacts that are not DNC and whose `next_follow_up.due_at` satisfies `dueWithinEasternToday()` (overdue, or any time later today in America/New_York).
3. `releasedInitial` = base-queue items with `reason === 'initial'`.
4. Reserve = reserve candidates from the same snapshot, reversed so the **oldest import releases first**.
5. **If `releasedInitial === 0` and reserve is non-empty**: insert `initial` follow-ups (`due_at = now`) for the first `batchSize` reserve contacts and append them to the in-memory queue as synthetic items (`follow_up.id = 'pending-<contactId>'`; only used as a React key, the Start Call link keys off `contact.id`). **Do not re-read** after inserting: Next.js request memoization returns the stale pre-insert `getContacts` result, which once caused a runaway release (7 → 14 → 21 per reload). Release-from-one-snapshot makes the function idempotent per request.
6. Split: `followUps` = queue items with `reason !== 'initial'` (retry / manual / three_month / quarterly), `newCalls` = `reason === 'initial'`, both sorted by `due_at`. `waiting` = reserve minus what was just released.

Rules agreed with the product owner and encoded here: the queue is never shown empty while reserve remains; while cold calls remain it does **not** top up (work the batch down, then the next appears); no time gate and no volume cap; scheduled callbacks are never throttled and always release at full batch size regardless of how many callbacks are due. `addMoreCalls()` → `releaseReserveContacts(ownerId, n)` lets a fast caller pull the next batch early (`components/reactivation/add-more-calls.tsx`).

### 12.3 Presentation: `components/reactivation/calls-due-section.tsx`

Client component that owns the whole "Calls Due Today" section. It buckets by the **caller's device clock** (`new Date().getHours()`: <12 morning, <15 midday, else afternoon) against each follow-up's suggested band (`suggestedCallTime(reason, dueAt)` in `lib/call-time.ts`, which returns a band only for `retry` and `manual`, using **Eastern** time):

- No band (quarterly / three_month) or band == now → **Calls Due Now**
- Band later than now → **Coming up later today**
- Band earlier than now (missed) → **hidden** today; it resurfaces tomorrow in its band with a "1 day overdue" badge from `dueLabel()` in `call-queue.tsx`
- `newCalls` always go into **Calls Due Now**, after the timed follow-ups

Bucketing runs in `useEffect` after mount (server render shows everything in due-order) to avoid hydration mismatch. `components/reactivation/call-queue.tsx` is a dumb list renderer (`QueueRow` shows name, niche, overdue badge, band chip "Call afternoon" + "Suggested 4:00 PM ET", lock chip for inactive niches, Start Call link).

---

## 13. Reactivation system, part 4: the call screen, dispositions, and cadence

### 13.1 The call page (`app/portal/dialer/call/[contactId]/page.tsx`)

Server component. Requires session; loads the contact and **404s if `contact.owner_id !== accessOwnerId(participant)`**. Then in parallel: `getOwnerNiches`, `getMasterScript`, `getScriptSections`, `getCallQueue` (to compute `nextContactId` for the "next call" button), the owner record (for practice name / office phone / provider name), `getCallHistory(contactId)` (calls joined to caller name), and `getScriptFlow`. Blocks with the red card if the niche is inactive (11.3). Passes everything to `CallScreen`.

### 13.2 `components/reactivation/call-screen.tsx`

Client component: niche picker (persists via `setSelectedNiche`), font size, the `ScriptFlowPlayer`, a TipTap notes editor (`rich-text-editor.tsx`), call history, the disposition bar, the voicemail dialog, and a date-time picker (`date-time-picker.tsx`, `lib/lazy-time.ts` for forgiving time parsing) used for both "call back later" and "scheduled" (captures `appointment_at`). Submits `logCall(formData)` via `useTransition`, then offers "Next call" (`nextContactId`) or back to the Dialer.

### 13.3 `logCall()` in `app/actions/reactivation.ts`: the disposition engine

Inputs: `contactId`, `disposition`, `voicemailLeft`, `notes`, `callBackAt`, `appointmentAt`. Validates the disposition against the six allowed values and that the contact belongs to `accessOwnerId(participant)`.

1. Insert `reactivation_calls` (`caller_id = participant.id`, `appointment_at` only when `scheduled`).
2. Set `completed_call_id = call.id` on **all** open follow-ups for the contact.
3. Patch the contact: `first_call_at` if unset; `stage_id` by lowercase name; `do_not_call` for DNC.
4. Create the next follow-up per the cadence table:

| Disposition | Next `due_at` | `reason` | Stage |
|---|---|---|---|
| `no_answer`, `voicemail` | If `now < first_call_at + 2 months` (`RETRY_WINDOW_MONTHS`): `nextScatteredRetry()` = 4–7 days out, weekends bumped to Monday, random hour 9:00–17:30 **Eastern** on the :00 or :30. Else `monthsFromNow(3)` at 10:00 AM Eastern | `retry` / `quarterly` | Contacting |
| `spoke_did_not_schedule` | `monthsFromNow(3)` 10:00 AM ET | `three_month` | Spoke To |
| `spoke_call_back_later` | the picked `callBackAt`, else `nextScatteredRetry()` | `manual` | Spoke To |
| `scheduled` | `monthsFromNow(3)` 10:00 AM ET | `quarterly` | Scheduled |
| `do_not_call` | none; `do_not_call = true` | — | — |

All wall-clock math goes through `easternWallClockToUtc(y, m, d, hh, mm)` in `lib/call-time.ts` (DST-safe via `Intl` `shortOffset` probing). This exists because Vercel functions run in UTC and an earlier `setHours(10)` produced 5:00 AM Eastern follow-ups in winter. Rule: no follow-up may land outside ~9 AM–7 PM Eastern.

### 13.4 Team stats

`getTeamStats(owner, staff)` reads all `reactivation_calls` for the account's member ids and computes per member: calls today / this week, scheduled this week, voicemails this week, all-time calls, reached (`spoke_did_not_schedule | spoke_call_back_later | scheduled`), scheduled, `success_rate = scheduled / calls`, `conversion_rate = scheduled / reached`. Rendered by `components/reactivation/team-stats.tsx` on the Dialer (owners only, compact) and Analytics pages.

---

## 14. Analytics

### 14.1 Portal analytics (`/portal/analytics`, `/portal/analytics/[callerId]`)

Data: `lib/data/caller-analytics.ts` (paginates `reactivation_calls` past the 1,000-row cap).

- `getCallAnalytics(memberIds)` → `CallAnalytics` (types in `lib/analytics-types.ts`): best time-of-day / day-of-week buckets (`MIN_BUCKET_SAMPLE = 3` conversations before a bucket is trusted), per-niche rows, monthly and weekly series (Recharts via `components/analytics/call-charts.tsx`, `blocks.tsx`).
- `getNicheLeaders(members)` → per niche, the caller with the best **close rate** (scheduled ÷ reached, per conversation not per dial); needs ≥3 conversations to qualify, 2+ qualified callers for a "leader", ties shown together. `components/analytics/niche-leaders.tsx`. Solo accounts get a compact "your close rate by niche" list.
- `getTrainingAudit(...)` → training completion per caller alongside call outcomes (`components/analytics/training-audit.tsx`), the cause-and-effect story the demo leans on.
- `sameAccount()` guards the drill-down so a caller id from another account 404s.

Analytics are visible to owners and staff (product ruling).

### 14.2 Admin analytics (`/admin`, `/admin/analytics`)

Data: `lib/data/analytics.ts`: `getDashboardStats()` (viewer counts, watch time, sessions, completions, library size), `getMostWatchedVideos()`, `getViewerRows()`, `getActivityEvents({ participantId?, limit })`, `getAllProgress()`. These are **training** analytics (video engagement). Filters via `components/admin/activity-filters.tsx`. Per-account **reactivation** accountability lives on the participant detail page (15.4) via `getAccountReactivationStats(ownerId, memberIds)`: total contacts, live in queue (+ oldest age in days), in reserve, ever called, calls this week/today, last call. Amber warning when contacts exist but no calls in 7 days, or the oldest live cold call is ≥5 days old. Judges throughput and staleness, not raw overdue counts.

---

## 15. Admin dashboard, page by page

Layout `app/admin/layout.tsx`: `components/admin/sidebar.tsx` (nav: Dashboard; Operations: Courses, Viewers, Reactivation, Email Templates, Payments, Landing Pages; Insights: Analytics; plus "Add Participant" → `/admin/participants?new=1`), header, `UploadTray`, sonner `Toaster` (bottom-right). Toast helpers with a synthesized WebAudio chime are in `lib/notify.ts`.

| Route | Reads | Writes (server actions) | Key components |
|---|---|---|---|
| `/admin-login` | — | `adminLogin` | `admin-login-form.tsx` |
| `/admin` | `getDashboardStats`, `getMostWatchedVideos`, `getViewerRows` | — | inline |
| `/admin/courses` | `getCourses` | `createCourse` (sector picker) | `course-card.tsx`, `new-course-dialog.tsx` |
| `/admin/courses/[id]` | `getCourseTree(id)` (drafts included), `getAttachmentsForVideos` | `updateCourse`, `deleteCourse`, `createModule`, `updateModule`, `deleteModule`, `moveModule`, `createVideo`, `updateVideo`, `deleteVideo`, `moveVideo`, `addAttachment`, `deleteAttachment` | `course-header-editor.tsx`, `module-editor.tsx`, `new-module-form.tsx`, `new-video-form.tsx`, `video-row.tsx`, `upload-video-dialog.tsx`, `thumbnail-dialog.tsx` |
| `/admin/participants` | all participants | `createParticipant` | `viewer-search.tsx`, `new-participant-dialog.tsx` |
| `/admin/participants/[id]` | participant, staff, aliases, sessions, courses + `course_access`, niches + `niche_access`, activity events, `video_progress`, per-course trees, `getAccountReactivationStats` | `updateParticipant`, `deleteParticipant`, `setCourseAccess`, `setNicheAccess`, `createParticipant` (staff) | `course-access-toggle.tsx`, `niche-access-toggle.tsx` (grouped by sector), `add-staff-form.tsx`, `participant-active-toggle.tsx`, `course-engagement.tsx` |
| `/admin/reactivation` | `getNiches()`, `getMasterScript`, `getScriptSections`, `extractSlots` | `createNiche`, `updateNiche`, `deleteNiche`, `updateMasterScript`, `saveScriptSection` | `niche-manager.tsx`, `master-script-editor.tsx`, `niche-sections-editor.tsx`. **Does not edit `script_flow_*`**; those are edited via SQL |
| `/admin/emails` | `EMAIL_TEMPLATES` (static) | — | `email-previewer.tsx` (audience switcher, iframe preview, copy HTML, download zip) |
| `/admin/payments` | `listPaymentLinks` (polls every 20 s while visible) | `createPaymentLink`, `deletePaymentLink`, `startPaymentCheckout` (charge card now) | `payments-manager.tsx` (copy / open / QR via `qrcode` / embedded Stripe) |
| `/admin/payments/[id]` | `getPaymentLink` | `provisionAccountsNow` | `payment-detail-actions.tsx` |
| `/admin/landing` | static list of landing pages | — | `landing-previewer.tsx` |
| `/admin/analytics` | `getDashboardStats`, `getViewerRows`, `getActivityEvents`, `getAllProgress`, course trees | — | `activity-filters.tsx` |

---

## 16. Client portal, page by page

Layout `app/portal/layout.tsx`: `DemoBarServer` (renders only for demo participants), header with logo, `PortalNav` (Contacts, Training, Dialer, Analytics) + settings gear + Sign Out. Widths from `lib/portal-layout.ts`.

| Route | Purpose | Reads | Writes |
|---|---|---|---|
| `/login` | Name + email login | — | `login` |
| `/portal` | Training home: accessible courses with progress bars; owners get "Add Staff Member" | `getAccessibleCourses`, `getCourseTree(live)`, `getProgressForParticipant`, `computeCourseState`, `getStaffMembers`, `getOwnerSectors` | `addTeamMember` |
| `/portal/course/[slug]` | Module/video list with lock states; top-right "Practice Script" button | same + `getCourseBySlug` | — |
| `/portal/course/[slug]/video/[videoId]` | Player, attachments, up-next, prev link | + `getAttachmentsForVideos` | `POST /api/progress` |
| `/portal/dialer` | Team stats (owner), how-it-works, Calls Due Today | `getCallQueueState`, `getOwnerNiches`, `getStaffMembers`, `getTeamStats` | `addMoreCalls` |
| `/portal/dialer/call/[contactId]` | Live call | section 13.1 | `logCall`, `setSelectedNiche` |
| `/portal/dialer/script` | Practice mode | `getOwnerNiches`, `getScriptFlow`, `getMasterScript`, `getScriptSections` | `setSelectedNiche` |
| `/portal/contacts` | Table, search, bulk actions (owner), Add, Import | `getContacts`, `getPipelineStages`, `getOwnerNiches`, `getNiches(true, sectors)`, `getServiceMappings` | `createContact`, `importContacts`, `bulkDeleteContacts`, `bulkAssignNiche`, `deleteContact` |
| `/portal/contacts/[id]` | Edit contact, call history, danger zone | `getContact`, `getCallHistory` | `updateContact`, `deleteContact` |
| `/portal/analytics`, `/portal/analytics/[callerId]` | section 14.1 | | — |
| `/portal/settings` | My profile; owner: practice details, calling defaults, callers, pipeline stages | `getOwnerNiches`, `getStaffMembers`, `getPipelineStages` | `updateMyProfile`, `setPracticeName`, `setOfficePhone`, `setDefaultNiche`, `setCallBatchSize`, `addTeamMember`, `setTeamMemberActive`, `updateTeamMember`, `createStage`, `moveStage`, `deleteStage` |
| `/portal/reactivation/[[...rest]]` | Legacy redirects to the new URLs | — | — |

---

## 17. Sales demo account (Ridgeline Chiropractic)

A permanent, self-regenerating fake practice so salespeople can demo without touching real data. Everything is in `lib/demo/config.ts` (static: names, IDs, rates), `lib/demo/seed.ts` (the generator), `lib/demo/sample-csv.ts` (the CSV offered in the import dialog), `app/actions/demo.ts`, `app/demo/page.tsx`, `components/demo/*`, `app/api/cron/demo-reset/route.ts`.

**Identities.** Owner Dr. Daniel Whitaker + callers Sarah Mitchell (closer), Marcus Reyes, Priya Nair, Tyler Brooks (underperformer who has not finished training). All emails are under `demo.reactivationpower.com`, all rows `is_demo = true`. Seven niches enabled (Chiropractic, Decompression, Joint Pain, ChiroThin, Gut Health, Neuropathy, Red Light). Three "showcase" niches have exactly one patient each and are timestamped so they always lead today's first cold-call batch.

**Entry.** `/demo` → `enterDemo(password)` compares to `DEMO_PASSWORD` → `ensureDemoSeeded()` → creates a `sessions` row and sets `tp_session` **as the demo owner** → `/portal`. The demo bar (`DemoBarServer` → `DemoBar`) offers: switch identity (`switchDemoView`, may only hop to another `is_demo` participant), "Reset demo data" (`resetDemo` = force rebuild), and a stale banner that calls `refreshDemoIfStale` if the data was seeded on a previous Eastern day.

**Rebuild lock (important after a Sept 2026 outage).** A rebuild may ONLY start via `ensureDemoSeeded()`. It uses `participants.demo_seed_started_at` on the owner row as a lock (`claimSeedLock` does a conditional update where the column is NULL or older than `SEED_LOCK_TTL_MS = 3 min`); other callers `waitForSeed()` for up to 90 s polling every 1.5 s. Page rendering never seeds; a failed read is reported as an error, never treated as "no data". Staleness = `demo_seeded_at` is on a previous America/New_York calendar day.

**Seed contents (`seedDemoData`).** Deterministic RNG (`mulberry32` seeded with `'ridgeline-chiro-demo-v1'`) so every rebuild is identical relative to today. Wipes `contacts` (cascading calls + follow-ups), `activity_events`, `video_progress`, `sessions`, `service_niche_mappings` for demo ids. Recreates 100 patients (60 "worked" with realistic call histories and notes per caller profile, 40 never-called), all `follow_ups`, and training data (`sessions`, `activity_events`, `video_progress`) so each caller's completion count matches their profile (owner: first two videos done). Dates are always relative to now.

**Cron.** `GET /api/cron/demo-reset` at 08:00 UTC daily with `Authorization: Bearer ${CRON_SECRET}` → `ensureDemoSeeded({ force: true })`.

**Guards elsewhere.** `importContacts` simulates for demo (no writes). `service_niche_mappings` are not saved for demo.

---

## 18. Public marketing site and lead funnel

Pages: `/` (home with revenue calculator hero, "The idea", services-we-support, CTAs), `/how-it-works`, `/schedule-a-call` (Step 1 form → Step 2 calendar), `/healthcare` (email-campaign landing page with hero calculator, testimonial, lead form/dialog), `/healthcare/testimonial`, `/healthcare/book-a-call`, `/healthcare/thank-you`, `/healthcare/your-opportunity` (`permanentRedirect` to book-a-call preserving the query). Shared chrome: `components/site/site-header.tsx`, `site-footer.tsx`, `services-we-support.tsx`. Strategy: call-first; there is **no self-serve purchase**; every CTA goes to `/schedule-a-call`.

**Service catalog.** `lib/service-catalog.ts` is the single source of truth for services shown publicly: `SERVICE_GROUPS` (chiropractic, medspa, dental, weight), each service `{ label (public), niche (exact `niches.name`) }`, optional `alsoOffered` display-only lines, `PRACTICE_TYPES_LINE`, `publicServiceName()`. Consumers: `services-we-support.tsx`, `services-multi-select.tsx` (shows label, submits niche), thank-you page. "Niche" is internal vocabulary; public pages say "service".

**Revenue calculator.** `lib/opportunity.ts`: `REACTIVATION_RATE = 0.05` (never shown), inactive-patient slider 100–5,000 step 100 default 1,000, value slider $1,000–$5,000 step 100 default $2,000. Canonical illustration everywhere: 1,000 × 5% = 50 × $2,000 = $100,000. `components/landing/opportunity-context.tsx` (`OpportunityProvider` / `useOpportunity`) shares the two slider values between `hero-opportunity.tsx` and `lead-form.tsx`, tracking whether the visitor touched them.

**Lead submit** (`components/landing/lead-form.tsx` → `submitHealthcareLead()` in `app/actions/leads.ts`, validation in `lib/lead-validation.ts`, phone mask in `lib/phone.ts`):

1. Server-side validation (same rules the client ran).
2. Zip → city/state via `https://api.zippopotam.us`.
3. If GHL is configured: `upsertGhlContact()` (tags `reactivation-power-lead`, `healthcare-funnel`, source string) and two notes: the submission summary (name, practice, location, years, inactive count with a "(default — visitor did not adjust)" or "(assumed — no calculator on that page)" flag, value used, revenue shown, services) and a consent record (timestamp, IP, page). CRM failure is logged and **never blocks the lead**.
4. Insert `landing_leads`.
5. Redirect `/healthcare/book-a-call?name&inactive&value&services&cid=<ghlContactId>`.

**Booking** (`components/landing/booking-calendar.tsx` → `app/actions/booking.ts`): `getAvailability(tz)` fetches 45 days of free slots from GHL in ≤30-day chunks (GHL caps at 31) for one of 7 US zones (`lib/us-timezones.ts`, auto-detected); `bookAppointment` → `bookGhlAppointment()` (status `confirmed`, title "Reactivation Power Strategy Call w/ {name from GHL}") → sets GHL custom field `contact.appointment_date_and_time` ("Wednesday, Aug. 21st, 2026 at 11:00 AM ET", field id resolved by key and cached) → adds a note → client `router.push('/healthcare/thank-you?name&cid&inactive&value&services&slot&tz')`, which shows the booked time and the calculator (`opportunity-calculator.tsx`). Booking requires a GHL contact id, which is why the form always precedes the calendar. **Never submit the real form or confirm a real booking in tests** (creates live GHL records).

---

## 19. Payments (Stripe) and account provisioning

Admin-driven, custom-amount checkout for the product "Reactivation Power Access".

1. Admin creates a link on `/admin/payments`: `createPaymentLink({ name, email, phone, staff[≤5], amountDollars })` → `payment_links` row with `token = randomBytes(...).toString('base64url')`, status `pending`. Admin copies `/pay/<token>`, shows a QR, or charges the card in an embedded dialog.
2. Buyer opens `/pay/[token]` (`components/landing/pay-checkout.tsx`, `@stripe/react-stripe-js` `EmbeddedCheckoutProvider` with `fetchClientSecret = () => startPaymentCheckout(token)`).
3. `startPaymentCheckout(token)` (public, no auth: the token is the secret) re-reads the amount from the DB, creates a Checkout Session `{ ui_mode: 'embedded_page', redirect_on_completion: 'never', mode: 'payment', customer_email, line_items[price_data usd unit_amount], metadata.payment_link_token }` with idempotency key `pl-<linkId>-<10-minute bucket>`, stores `stripe_session_id`, returns `client_secret`. Returns null if already paid.
4. On `onComplete`, the client calls `confirmPayment(token)`, which **retrieves the session from Stripe** and only if `payment_status === 'paid'` marks the link paid and calls `provisionAccounts(linkId)`; then routes to `/pay/[token]/thank-you` (server re-verifies; unpaid visitors bounce back).
5. `provisionAccounts` (idempotent, non-fatal): buyer → owner participant (reuse if email exists), each valid staff email → staff participant under the owner (skip duplicates), stamps `participant_id` + `provisioned_at`. Admin can retry via `provisionAccountsNow`. Newly provisioned owners still need `course_access` and `niche_access` toggled by admin.

There is **no Stripe webhook**; confirmation is client-triggered then server-verified. A buyer who closes the tab between paying and `onComplete` would show as pending until an admin re-runs the flow; consider adding a `checkout.session.completed` webhook after migration.

Subscription / call-credit pricing has been **discussed but not built** (setup fee + tiered monthly call credits). Nothing in code reflects it yet.

---

## 20. Email template system

`lib/email-templates.ts` (3,149 lines) is a pure TypeScript module: `EMAIL_AUDIENCES` (currently one: `chiropractic`), `EMAIL_TEMPLATES: EmailTemplate[]` (68 templates: a 40-email evergreen sequence plus 3-per-day "blitz" variants `X.1/X.2/X.3` for days 1–14), each `{ id, audience, name, subject, preheader, html }` built from shared helpers (`shell`, `h1`, `p`, `cta`, `checks`, `compareTable`, `steps`, `image`, …) for a 640 px table-based layout, Arial stack, teal `#39889f` accent, GHL merge fields `{{contact.first_name}}` and `{{unsubscribe_link}}`. Images referenced as `EMAIL_ASSET_BASE = 'https://www.reactivationpower.com/images/emails'` + filename; the 55 JPGs live in `public/images/emails/` and only go live when the site is published. The previewer rewrites that base to `/images/emails` for the iframe only.

Admin surface: `/admin/emails` (`components/admin/email-previewer.tsx`) and `GET /api/admin/emails/export?audience=<id>` (admin cookie required) which zips `START-HERE.html`, `emails.csv`, and `emails/<audience>/NN-slug.html` with `fflate`. Emails are sent from GoHighLevel, not from this app; the app only authors and exports them. Rules: no seasonal emails, no dingbat glyphs (tofu in Arial fallbacks), no invented result statistics, one default "Schedule a Call" button except long-form emails which get two with non-matching labels.

---

## 21. Complete route map

### Pages (`app/**/page.tsx`)

Public: `/`, `/how-it-works`, `/schedule-a-call`, `/healthcare`, `/healthcare/testimonial`, `/healthcare/book-a-call`, `/healthcare/thank-you`, `/healthcare/your-opportunity` (redirect), `/pay/[token]`, `/pay/[token]/thank-you`, `/login`, `/admin-login`, `/demo`, `/training-demo`, `/training-demo/video-2` (internal "training video kit": auto-playing screenshot walkthrough + narration script for recording the office training video; `robots: noindex`).

Portal (`tp_session`): `/portal`, `/portal/course/[slug]`, `/portal/course/[slug]/video/[videoId]`, `/portal/dialer`, `/portal/dialer/call/[contactId]`, `/portal/dialer/script`, `/portal/contacts`, `/portal/contacts/[id]`, `/portal/analytics`, `/portal/analytics/[callerId]`, `/portal/settings`, `/portal/reactivation/[[...rest]]` (redirects), `/portal/not-found`.

Admin (`tp_admin`): `/admin`, `/admin/courses`, `/admin/courses/[id]`, `/admin/participants`, `/admin/participants/[id]`, `/admin/reactivation`, `/admin/emails`, `/admin/payments`, `/admin/payments/[id]`, `/admin/landing`, `/admin/analytics`.

### Route handlers (`app/api/**/route.ts`)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/media?pathname&admin&download` | GET | `tp_session` unless `admin=1` | Stream private Blob with Range support |
| `/api/upload?kind&name` | POST | none | Legacy server-side Blob upload |
| `/api/upload/token` | POST | none (pathname prefix allow-list) | Issue direct-upload tokens (`handleUpload`) |
| `/api/progress` | POST | `tp_session` | Video heartbeat / completion |
| `/api/templates/contacts?variant` | GET | `tp_session` | Personalized CSV import template |
| `/api/admin/emails/export?audience` | GET | `tp_admin` | Zip of email HTML |
| `/api/cron/demo-reset` | GET | `CRON_SECRET` bearer | Nightly demo rebuild |

### Server actions (`app/actions/*.ts`, all `'use server'`)

- `auth.ts`: `login`, `logout`
- `admin-auth.ts`: `adminLogin`, `adminLogout`
- `admin.ts`: `createCourse`, `updateCourse`, `deleteCourse`, `createModule`, `updateModule`, `deleteModule`, `moveModule`, `createVideo`, `updateVideo`, `deleteVideo`, `moveVideo`, `addAttachment`, `deleteAttachment`, `createParticipant`, `updateParticipant`, `deleteParticipant`, `setCourseAccess`, `setNicheAccess`
- `reactivation.ts`: `createNiche`, `updateNiche`, `deleteNiche`, `updateMasterScript`, `saveScriptSection`, `createStage`, `moveStage`, `deleteStage`, `createContact`, `updateContact`, `deleteContact`, `bulkDeleteContacts`, `bulkAssignNiche`, `setDefaultNiche`, `importContacts`, `setCallBatchSize`, `addMoreCalls`, `setSelectedNiche`, `setPracticeName`, `setOfficePhone`, `addTeamMember`, `setTeamMemberActive`, `updateTeamMember`, `updateMyProfile`, `logCall`
- `payments.ts`: `createPaymentLink`, `listPaymentLinks`, `getPaymentLink`, `deletePaymentLink`, `startPaymentCheckout`, `confirmPayment`, `provisionAccountsNow`, `getPaymentLinkPublic`
- `leads.ts`: `submitHealthcareLead`
- `booking.ts`: `getAvailability`, `bookAppointment`
- `demo.ts`: `enterDemo`, `resetDemo`, `refreshDemoIfStale`, `switchDemoView`

### Data-access modules (`lib/data/*.ts`, all `server-only`)

`participants.ts` (identity), `courses.ts` (content + entitlements + sectors), `progress.ts` (watch state + lock computation), `activity.ts` (`logEvent`), `analytics.ts` (admin training analytics), `caller-analytics.ts` (portal call analytics), `reactivation.ts` (niches, scripts, contacts, queue, team stats, account stats).

### Other `lib/` modules

`auth/{token,session,admin-token}.ts`, `supabase/admin.ts`, `types.ts` (all shared interfaces + constants `MAX_STAFF`, `COMPLETION_THRESHOLD`, `CALL_BATCH_SIZES`, `RETRY_WINDOW_MONTHS`, `DISPOSITION_LABELS`, `SECTOR_LABELS`), `script-merge.ts`, `concern-options.ts`, `niche-match.ts`, `call-time.ts`, `lazy-time.ts`, `notes-html.ts` (sanitize), `notes-text.ts` (HTML → text), `phone.ts`, `format.ts`, `media.ts`, `upload-client.ts`, `upload-manager.ts`, `portal-layout.ts`, `ghl.ts`, `stripe.ts`, `lead-validation.ts`, `opportunity.ts`, `us-timezones.ts`, `service-catalog.ts`, `email-templates.ts`, `notify.ts`, `analytics-types.ts`, `demo/{config,seed,sample-csv}.ts`, `utils.ts` (`cn`).

---

## 22. Static assets and the `scripts/` folder

`public/`: `images/logo.png`, `images/logo-slogan.png`, `images/emails/*.jpg` (55 marketing graphics), `images/email-*.png`, `templates/contact-import-template.csv` (static fallback), `training/*.png` + `training/video2/` (screenshots for the training video kit), `team/reactivation-power-demo-script.pdf`, favicons (`icon.svg`, `icon-light-32x32.png`, `icon-dark-32x32.png`, `apple-icon.png`), placeholders.

`scripts/`: historical one-off migrations and seeders, run manually with `node --env-file=... scripts/x.mjs` against `POSTGRES_URL_NON_POOLING` using `pg`. `006_reactivation.sql` created the original reactivation tables. `007`–`012` and `seed-*.mjs` seeded/adjusted script flows and niches. **They are not idempotent as a set and must not be re-run on the live database.** The live schema has since been changed many times via direct SQL (columns like `original_complaint`, `is_demo`, `call_batch_size`, tables like `niche_access`, `payment_links`, `landing_leads`, `admin_login_attempts` were added ad hoc). The authoritative schema is the live database (section 6), not these files. For migration, dump the live schema with `pg_dump --schema-only` rather than replaying `scripts/`.

---

## 23. Known quirks, gotchas, and deliberate design decisions

**Data layer**
- PostgREST returns at most 1,000 rows per request. `script_flow_steps` (552) and `script_flow_choices` (1,322) are read with `fetchAllRows()` pagination; `caller-analytics.ts` paginates `reactivation_calls`. Any new full-table read of a growing table must do the same.
- Next.js memoizes identical fetches within one render. Never read → write → re-read the same query in one request expecting fresh data (the queue release bug). Compute from a single snapshot.
- Supabase joins use the PostgREST embed syntax: `.select('*, niche:niches(*), stage:pipeline_stages(*)')`.
- Timestamps are UTC in the DB; all human-facing scheduling is anchored to America/New_York via `lib/call-time.ts`. The Vercel runtime is UTC.
- `follow_ups.reason` and `reactivation_calls.disposition` are enforced by CHECK constraints; adding a value requires a migration.
- `pipeline_stages` matching in `logCall` is by lowercase **name** (`contacting`, `spoke to`, `scheduled`). Renaming a global stage silently disables that transition.
- `niches.name` is a literal key in `lib/concern-options.ts`, `lib/service-catalog.ts`, `app/api/templates/contacts/route.ts` (`NICHE_SAMPLES`), and the keyword rules in `lib/niche-match.ts`.

**Auth**
- Portal login is passwordless by design (name + email). Email is the only credential.
- `SUPABASE_JWT_SECRET` is repurposed as the cookie HMAC key. If it is absent the code falls back to `'dev-secret'`; make sure it is set in the new environment or all cookies become forgeable.
- Admin cookie is not cleared by the sidebar Sign Out (7.2).

**Files**
- Blob store is private. There is no public URL for anything in it. Video `<img>`/`<video>` tags must go through `/api/media`.
- Deleting videos does not delete blobs (9.6).
- `next.config.mjs` has `images.unoptimized: true`, so `next/image` does no processing.

**UI**
- Base UI dialogs/triggers use the `render` prop, not `asChild` (nested-button hydration errors otherwise).
- `components/ui/button.tsx` has no `asChild`; use a styled `<a>` for link-buttons.
- Number inputs report as role `spinbutton` in accessibility snapshots.
- App is forced light mode (`<html className="light">`), `next-themes` is installed but unused.
- Contact notes are HTML (TipTap); always pass through `sanitizeNotes` on write and `notesToText` when a plain string is needed.

**Product rules encoded in data or code**
- No em dashes in scripts or portal UI. No normalizing phrases. No "today" in commitments. Recommendation structure (10.7).
- Import never creates follow-ups; the queue self-fills a batch at a time.
- No-answer retries scatter 4–7 days at random ET business hours; every second attempt is a voicemail.
- A CSV Niche value that is a real niche not enabled on the account is stored (true niche) and blocked, not defaulted. Enabling niches is admin-only; the client is told to contact the team.
- Analytics rank callers by close rate per conversation, not per dial.
- Demo data may only be rebuilt through `ensureDemoSeeded()`.

**Build**
- `typescript.ignoreBuildErrors: true`: `pnpm exec tsc --noEmit` will surface errors the build hides.
- Removing an `app/` route can leave a stale `.next/dev/types/validator.ts` fragment locally; harmless, regenerates on a clean build.

---

## 24. Migration checklist

1. **Database**: point the new environment at the same Supabase project (`jbdymqqpolkoevyypjxd`) or `pg_dump` / restore it. Preserve RLS-enabled-no-policies on every table (or write real policies). Provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Drop `script_dedash_backup_20260911` once approved.
2. **Cookie secret**: set `SUPABASE_JWT_SECRET` (any long random string works; changing it logs everyone out).
3. **Blob**: either keep the same Vercel Blob store (provide its `BLOB_READ_WRITE_TOKEN`) or copy every object referenced by `videos.video_url`, `videos.thumbnail_url`, `attachments.file_url` to the new store and keep the pathnames identical (the DB stores pathnames, not URLs). If leaving Vercel, replace `@vercel/blob` `get/put/handleUpload` in `/api/media`, `/api/upload`, `/api/upload/token`, and `lib/upload-client.ts` with the equivalent for the new store, keeping Range support and private access.
4. **Secrets**: `ADMIN_PASSWORD`, `DEMO_PASSWORD`, `CRON_SECRET`, `STRIPE_SECRET_KEY` (live), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `GHL_API_TOKEN`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID`.
5. **Cron**: recreate the daily `GET /api/cron/demo-reset` job (08:00 UTC) with the bearer secret, or disable the demo.
6. **Domain**: `www.reactivationpower.com` canonical (apex redirects). Email graphics resolve against this host.
7. **Hardening to do first** (section 5.5): add `requireAdmin()` to every function in `app/actions/admin.ts` and the five admin functions in `app/actions/reactivation.ts`; require the admin cookie on `/api/upload`, `/api/upload/token`, and the `admin=1` branch of `/api/media`.
8. **Nice to have**: Stripe `checkout.session.completed` webhook; Blob cleanup on delete; retire the legacy master-script editor.
9. **Never in tests**: submit the live lead form, confirm a live booking, or query real (non-demo) patient rows. Use the demo account (`is_demo = true`) for anything patient-shaped.
