import { Router, type IRouter, type Request, type Response } from "express";
import { runWithRequestContext } from "@/lib/request-context";
import { currentDueKey, runCronJob, type CronJobName } from "@/lib/cron/jobs";
import { retryFailedNotifications } from "@/lib/billing/notifications";
import { deliverLeadEmails } from "@/lib/lead-followup/notifications";
import { retryPendingEnrollmentInvitations } from "@/lib/agreements/enrollment-invitation";
import { runSalesWorker } from "@/lib/sales-leads/worker";
import { reconcileMarketing } from "@/lib/marketing/reconcile";
import { logger } from "@/lib/logger";
import { NATIVE_WAKE_HEADER,NATIVE_WAKE_MARKER,recordNativeWake } from "@/lib/sales-leads/wake";

const router: IRouter = Router();
/**
 * External triggers for the scheduled jobs (`Authorization: Bearer
 * $CRON_SECRET`), meant to be hit by an external cron at the slot time.
 * They claim the same daily slot as the in-process scheduler
 * (lib/cron/scheduler.ts): whichever fires first runs the job, the other
 * gets `{ ok: true, skipped: true }`. Add `?force=1` to run again outside
 * the slot (still refused while a run is in progress). Every run is recorded
 * in cron_runs and a thrown error emails the super admin.
 */
function cronRoute(job: CronJobName) {
  return async (req: Request, res: Response) => {
    await runWithRequestContext(req, res, async () => {
      const expected = process.env.CRON_SECRET;
      if (!expected || req.get("authorization") !== `Bearer ${expected}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const force = req.query.force === "1" || req.query.force === "true";
      const outcome = await runCronJob(job, { trigger: "http", dueKey: force ? undefined : currentDueKey(job) });
      if ("skipped" in outcome) {
        res.json({ ok: true, skipped: true, reason: outcome.reason, runId: outcome.existing?.id ?? null, status: outcome.existing?.status ?? null });
        return;
      }
      if (!outcome.ok) {
        res.status(500).json({ error: outcome.error, runId: outcome.run.id });
        return;
      }
      const notifications = job === "billing-retry" ? await retryFailedNotifications() : undefined;
      res.json({ ok: true, runId: outcome.run.id, ...outcome.summary, ...(notifications ? {notifications} : {}) });
    });
  };
}

router.get("/cron/demo-reset", cronRoute("demo-reset"));
router.get("/cron/billing-retry", cronRoute("billing-retry"));
router.get("/cron/auth-cleanup", cronRoute("auth-cleanup"));
// Five-minute external trigger keeps retries moving when autoscale sleeps.
router.get("/cron/lead-emails", async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.get("authorization") !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await deliverLeadEmails();
  await retryPendingEnrollmentInvitations();
  await runSalesWorker();
  await reconcileMarketing().catch(() => logger.warn("Marketing reconciliation deferred"));
  res.json({ ok: true });
});

// Dedicated five-minute wakeup; durable worker claims make overlaps safe.
router.get("/cron/sales-leads", async (req,res) => {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.get("authorization") !== `Bearer ${expected}`) {
    res.status(401).json({error:"Unauthorized"});
    return;
  }
  await runWithRequestContext(req,res,async () => {
    await runSalesWorker();
    await reconcileMarketing().catch(() => logger.warn("Marketing reconciliation deferred"));
    if (req.get(NATIVE_WAKE_HEADER) === NATIVE_WAKE_MARKER) await recordNativeWake();
    res.json({ok:true});
  });
});
export default router;
