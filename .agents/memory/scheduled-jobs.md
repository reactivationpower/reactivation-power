---
name: Scheduled jobs on autoscale
description: Why daily jobs use a slot-claim table plus two triggers (in-process ticker + external cron), and why the scheduler is off in the workspace
---
- **Rule:** a day's job is a slot `(job, ET date)` claimed by unique insert in `cron_runs`. Both the in-process ticker and the Bearer HTTP route claim the *same* slot; only explicit `?force=1` / admin "Run now" bypass it (and those still refuse while a run is in progress). Add jobs to the `CRON_JOBS` registry only.
- **Why:** the project is one autoscale deployment — it scales to zero, so an in-process timer alone cannot guarantee a 6 AM run; an external cron alone is a single point of failure the owner must set up. Two triggers + one claim gives on-time runs without ever double-retrying a customer's cards.
- **How to apply:** an external scheduler hitting the cron routes is still required for on-time runs (documented in replit.md) — do not describe the in-process ticker as sufficient. Keep the scheduler **off in the workspace**: the demo reset rebuilds the *shared* Supabase demo. Card declines inside a retry are a normal summary; only thrown errors alert the super admin.
