import { Router, type IRouter, type Request, type Response } from "express";
import { ensureDemoSeeded } from "@/lib/demo/seed";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";
import { retryPastDueInvoices } from "@/lib/billing/dunning";

const router: IRouter = Router();

router.get("/cron/demo-reset", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.get("authorization") !== `Bearer ${expected}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const result = await ensureDemoSeeded({ force: true });
    if (result.status === "error") {
      logger.error({ message: result.message }, "demo reset failed");
      res.status(500).json({ error: result.message });
      return;
    }
    if (result.status === "seeded") {
      res.json({ ok: true, ...result.summary });
      return;
    }
    res.json({ ok: true, status: result.status });
  });
});

/**
 * Daily dunning pass: every open invoice of every past-due customer is
 * re-attempted on the primary card, then the secondary. Schedule it once a
 * day with `Authorization: Bearer $CRON_SECRET`.
 */
router.get("/cron/billing-retry", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.get("authorization") !== `Bearer ${expected}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const summary = await retryPastDueInvoices("cron");
      logger.info(summary, "billing retry finished");
      res.json({ ok: true, ...summary });
    } catch (err) {
      logger.error({ err }, "billing retry failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Billing retry failed" });
    }
  });
});

export default router;