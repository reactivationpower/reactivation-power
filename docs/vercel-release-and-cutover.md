# Vercel: release flow, test deployment, switch-over and rollback

Plain steps for the owner. Settings, routing, scheduled jobs and the full
environment variable table are in `docs/vercel-hosting.md`.

Nothing in this guide has been done yet. The live site stays on Replit and
patientpipeline.app keeps pointing at Replit until you do the switch-over
yourself (part 4).

---

## 1. How code gets from Replit to Vercel

```
Replit (build and try changes) → GitHub (approved code) → Vercel (builds and hosts)
```

- **Replit** stays where all work happens. The workspace preview and the
  existing Replit deployment work exactly as before.
- **GitHub**: you push from Replit (Git pane) when a change is approved. The
  agent never pushes or merges for you.
- **Vercel** builds every push by itself:
  - a push to the **production branch** (`main`, set in Vercel → Settings → Git →
    Production Branch) makes a **Production** deployment;
  - a push to any other branch, or a pull request, makes a **Preview** deployment.
- Recommended habit: work on a branch → push → check its Preview → merge into
  `main` → Vercel deploys Production.
- The Vercel build only builds files. It never changes the database, never runs
  migrations and never runs jobs. Database changes are applied the same way as
  today, from Replit.

Until the switch-over, Vercel Production only lives at a temporary
`*.vercel.app` address. Customers keep using the Replit site.

## 2. One-time Vercel setup (you do this)

1. **Plan**: the project needs **Vercel Pro** (five-minute scheduled calls and
   300-second functions are not available on Hobby).
2. **Project settings**: change the existing project "reactivation-power"
   exactly as listed in `docs/vercel-hosting.md` → "Changes to the existing
   Vercel project". The important ones: Framework **Other**, Root Directory
   **empty**, Node.js **24.x**.
3. **GitHub**: Settings → Git → connect the repository; Production Branch `main`.
4. **Environment variables**: Settings → Environment Variables. Use the table in
   `docs/vercel-hosting.md`. For each one, tick **Production** and/or **Preview**
   as the table says, and mark secrets as **Sensitive**. Copy the values from
   Replit's Secrets yourself; never paste them into chat. For the test period:
   - `STRIPE_MODE` = `test` on **both** Production and Preview, with the
     sandbox keys. Live keys are added only at switch-over.
   - Do **not** add `SCHEDULED_JOBS` yet. Without it, nothing scheduled runs on
     Vercel.
   - `NODEJS_HELPERS` = `0` and `ENABLE_EXPERIMENTAL_COREPACK` = `1` on both.
5. **File storage (Blob)**: enter the **existing** `BLOB_READ_WRITE_TOKEN` as a
   variable. **Do not connect any Blob store to the project**, in particular not
   the newer store `store_FTLJ7opC5oZFY7X0`. Connecting a store adds its own
   `BLOB_READ_WRITE_TOKEN` and the app would point at an empty store (videos and
   files would disappear from the app).
6. **Stripe sandbox webhook (optional, test only)**: in Stripe **test mode** →
   Developers → Webhooks, add an endpoint
   `https://<temporary address>/api/webhooks/stripe` with the same events as the
   live endpoint, and put its signing secret in `STRIPE_TEST_WEBHOOK_SECRET`
   (Production). Do not touch the live-mode endpoints.

## 3. Test on the temporary Vercel address

### Which deployment to use

| | Vercel **Production** (temporary `*.vercel.app` address) | Vercel **Preview** |
| --- | --- | --- |
| Email | Real (sign-in codes, invitations) | Off |
| Sign-in with email code (admin, portal owners) | Works | **Not possible** (codes are not sent); use the demo accounts |
| Stripe | `test` during testing | `test` only |
| GoHighLevel texts/emails, sales workers | **Real** | Off |
| Scheduled jobs | Off (only the safe heartbeat) | Off |
| Database | Shared with the live site | Shared with the live site |

So: most checks happen on the **Production** deployment at its temporary
address. Do not share that address with anyone. Preview is for quick looks at a
branch with the demo accounts.

Both use the **live database**. Only use test customers, test leads, and email
addresses or phone numbers you own. Do not edit real customers there.

Email links always point to `https://patientpipeline.app` (the Replit site
today), even when the email was sent from Vercel; a temporary address is never
put into an email. To test the page behind a link on Vercel, open the link,
then replace `patientpipeline.app` in the address bar with the temporary address.

### Checklist

Write down pass/fail for each line. Use only test data and your own inbox.

1. **Opens**: home page, a deep link such as `/admin/billing` (reload it), and a
   missing page all load the app; `/api/healthz` answers.
2. **Admin sign-in** with the email code sent to your own inbox. Idle for 30
   minutes → logged out with the "Still there?" warning first.
3. **Portal sign-in** (owner with email code; demo account without).
4. **New customer invitation** to an address you own. Open the link on the
   temporary address (see above).
5. **Agreement signing and card enrollment** with Stripe test card
   `4242 4242 4242 4242`. Download the signed **PDF**.
6. **Booking confirmation**: only with a test lead that has your own phone/email,
   because GoHighLevel messages from Production are real. Skip if unsure.
7. **Source and referral links**: open a `/api/m/<code>` link and a page with
   `?ref=<code>`; check the visit shows in the admin attribution views.
8. **Analytics**: PostHog shows page views from the temporary address.
9. **Uploads**: upload a small file and a large video in the admin area.
10. **Videos**: a training video plays and you can jump ahead; the marketing
    video on the home page plays.
11. **Scheduled jobs (safe test)**:
    - Vercel → project → Settings → Cron Jobs → `/api/cron/heartbeat` → **Run**.
      Then on `/admin/payments` the Scheduled jobs card ends with "Scheduler
      check: last call received … (Vercel Cron, vercel-production; scheduled jobs off there)".
      It also appears by itself within an hour.
    - On the same Cron Jobs page, **Run** `/api/cron/billing-retry`: its log shows
      `"skipped":true` with "until switch-over". Nothing is charged.
    - "Run now" on the card answers "turned off on this Vercel deployment until
      switch-over".
12. **Vercel logs**: Vercel → Logs shows no errors from the steps above.

When the temporary address is ready, send it to the agent. The agent can then
check the pages that do not need a sign-in and report what passed on Vercel,
kept separate from what was only checked locally and what still needs you
(email codes, real inboxes).

## 4. Switch-over (later, only after you approve it)

Pick a weekday afternoon (US Eastern). Avoid 2–7 AM ET, when the daily jobs run.

1. **Write down the current DNS records** for `patientpipeline.app` and
   `www` (take a screenshot). You need them to roll back.
2. In Vercel Production variables: `STRIPE_MODE` = `live`, add
   `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET` (the signing secret of the existing live endpoint),
   `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY`. Redeploy. Open the temporary
   address and check the app starts (no charge needed).
3. **Webhooks**: in Stripe (live), Resend and GoHighLevel, check every webhook
   and callback address uses `https://patientpipeline.app/...`. If one uses a
   Replit address, change it to `patientpipeline.app`. Addresses on the domain
   follow the domain automatically when DNS moves.
4. **Domain**: Vercel → Settings → Domains → add `patientpipeline.app` and
   `www.patientpipeline.app`. Vercel shows the DNS records. Change them at your
   DNS provider. Keep the Replit deployment running.
5. When Vercel shows both domains as valid and `https://patientpipeline.app`
   loads from Vercel:
   - add `SCHEDULED_JOBS` = `on` to Vercel **Production** only and redeploy;
   - then in the Replit deployment set `CRON_SCHEDULER` = `off` and republish;
   - once the Sales automation checklist shows the scheduler stamped by Vercel
     Cron, ask the agent to retire the Supabase five-minute wake
     (`retireNativeWake()` in `lib/sales-leads/wake.ts`), so the sales worker is
     not woken twice.
   For a few minutes both may run; that is safe (each day's job is claimed once).
6. **Check right away**: sign in, open `/admin/payments`; the scheduler check
   line says "scheduled jobs on there". In Stripe and Resend, new webhook
   deliveries succeed. The Sales automation checklist still says ready (it is
   now stamped by the Vercel five-minute call).
7. **Next morning**: the Scheduled jobs card shows today's demo reset (3 AM),
   cleanup (4 AM) and billing retry (6 AM) as "Vercel Cron", no red, no
   "Overdue". Vercel → Logs has no cron errors.

## 5. Rollback

If something is wrong after the switch-over:

1. Put the **old DNS records** back (from step 1 above). Traffic returns to
   Replit as DNS updates (minutes to a few hours).
2. In Vercel Production remove `SCHEDULED_JOBS` (or set it to `off`) and
   redeploy. In the Replit deployment remove `CRON_SCHEDULER=off` and
   republish, so Replit runs the jobs again. If the Supabase five-minute wake
   was retired, ask the agent to set it up again.
3. Webhooks need no change if they use `patientpipeline.app`.
4. No data to undo: both sites use the same database, and nothing in the move
   changes its structure.

For a bad **code** change on Vercel (without moving DNS back): Vercel →
Deployments → pick the last good deployment → **Instant Rollback**.

## 6. Known limits on Vercel

- Requests and responses of at most 4.5 MB per call (large uploads go straight
  to Blob; see `docs/vercel-hosting.md`).
- One call may run at most 300 seconds; scheduled work stops at 240 seconds and
  continues on the next call.
- Vercel does not retry a failed scheduled call and does not guarantee every
  call; the five-minute workers call catches up missed daily jobs, and the jobs card shows anything late.
- Preview deployments read and write the live database.
- Sign-in codes are not sent from Preview.
- Patient texting (`/api/cron/patient-texting`) is not scheduled on Vercel while
  texting is off.
