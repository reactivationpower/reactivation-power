import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { runWithRequestContext } from "@/lib/request-context";
import { currentDueKey, runCronJob, type CronJobName, type CronTrigger } from "@/lib/cron/jobs";
import { runScheduledTick } from "@/lib/cron/tick";
import { RunBudget, cronRunBudgetMs } from "@/lib/cron/budget";
import { reconcileTextIntents } from "@/lib/patient-texting/worker";
import { isVercel, isVercelPreview } from "@/lib/deployment-safety";
import { NATIVE_WAKE_HEADER, NATIVE_WAKE_MARKER, recordNativeWake, recordVercelCronWake } from "@/lib/sales-leads/wake";

/**
 * Scheduled-job triggers, all behind `Authorization: Bearer $CRON_SECRET` —
 * the exact header Vercel Cron sends when CRON_SECRET is set on the project,
 * and what an external cron or the Supabase pg_cron wake sends on Replit.
 *
 * - GET /cron/<job>        one daily job (demo-reset, auth-cleanup, billing-retry)
 * - GET /cron/workers      the five-minute pass (lead emails, invitation
 *                          recovery, sales worker, marketing) plus a catch-up
 *                          claim of every daily slot (lib/cron/tick.ts)
 * - GET /cron/lead-emails, /cron/sales-leads   older names for the same pass
 * - GET|POST /cron/patient-texting   intent reconcile; not scheduled while texting is off
 *
 * Every call runs under a time budget below the function limit and returns
 * what it got done; whatever is left waits for the next call. A Vercel Cron
 * call is recorded with trigger `vercel-cron` (user-agent `vercel-cron/…`),
 * anything else as `http`.
 */

const router: IRouter = Router();

// Vercel Preview shares the production database: no scheduled job or worker may run there.
router.use("/cron", (_req, res, next) => {
  if (!isVercelPreview()) { next(); return; }
  res.status(503).json({ error: "Scheduled jobs are turned off on Vercel Preview deployments." });
});

function authorized(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.get("authorization") !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
router.use("/cron", authorized);

export function cronTrigger(req: Request): CronTrigger {
  return (req.get("user-agent") ?? "").toLowerCase().startsWith("vercel-cron") ? "vercel-cron" : "http";
}

/** Record which scheduler is alive for the sales-automation readiness checklist. */
async function recordWake(req: Request, trigger: CronTrigger) {
  if (trigger === "vercel-cron" && isVercel()) await recordVercelCronWake();
  else if (req.get(NATIVE_WAKE_HEADER) === NATIVE_WAKE_MARKER) await recordNativeWake();
}

/**
 * One daily job. Claims the same daily slot as the five-minute pass and the
 * in-process scheduler: whichever fires first runs the job, the others get
 * `{ ok: true, skipped: true }`; a run that stopped at its time budget is
 * continued by the next call. Both possible UTC hours of an Eastern slot are
 * scheduled on Vercel, so the wrong-hour call is a no-op through the same
 * slot claim. Add `?force=1` to run again outside the slot (still refused
 * while a run is in progress).
 */
function cronRoute(job: CronJobName) {
  return async (req: Request, res: Response) => {
    await runWithRequestContext(req, res, async () => {
      const trigger = cronTrigger(req);
      const force = req.query.force === "1" || req.query.force === "true";
      const outcome = await runCronJob(job, { trigger, dueKey: force ? undefined : currentDueKey(job), budget: RunBudget.of(cronRunBudgetMs()) });
      if ("skipped" in outcome) {
        res.json({ ok: true, skipped: true, reason: outcome.reason, runId: outcome.existing?.id ?? null, status: outcome.existing?.status ?? null });
        return;
      }
      if (!outcome.ok) {
        res.status(500).json({ error: outcome.error, runId: outcome.run.id });
        return;
      }
      res.json({ ok: true, runId: outcome.run.id, incomplete: outcome.incomplete, ...outcome.summary });
    });
  };
}

router.get("/cron/demo-reset", cronRoute("demo-reset"));
router.get("/cron/billing-retry", cronRoute("billing-retry"));
router.get("/cron/auth-cleanup", cronRoute("auth-cleanup"));

/** The five-minute pass. Durable claims make overlapping calls safe. */
async function workersRoute(req: Request, res: Response) {
  await runWithRequestContext(req, res, async () => {
    const trigger = cronTrigger(req);
    const report = await runScheduledTick({ trigger, budget: RunBudget.of(cronRunBudgetMs()) });
    await recordWake(req, trigger);
    res.json({ ok: true, ...report });
  });
}
router.get("/cron/workers", workersRoute);
// Older names kept for the Supabase pg_cron wake and any external cron already pointed at them.
router.get("/cron/lead-emails", workersRoute);
router.get("/cron/sales-leads", workersRoute);

// Patient texting is off; this stays unscheduled (not in vercel.json) until it is turned on.
const patientTextingRoute = async (_req: Request, res: Response) => {
  res.json(await reconcileTextIntents(new Date(), { deadline: RunBudget.of(cronRunBudgetMs()).deadline }));
};
router.get("/cron/patient-texting", patientTextingRoute);
router.post("/cron/patient-texting", patientTextingRoute);

export default router;
