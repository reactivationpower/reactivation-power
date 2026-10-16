import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./lib/stripe";
import { deploymentTarget } from "./lib/deployment-safety";
import { enableDatabaseReadTracking } from "./lib/startup";

/**
 * Vercel function entry. Wraps the same Express app as the Replit server
 * (src/index.ts), without app.listen, shutdown handling or the in-process
 * scheduler: Vercel Cron (vercel.json `crons`) calls the /api/cron routes
 * instead, and after-response work goes through lib/after-response.ts. Super-admin seeding and the encryption check do not run here;
 * use `pnpm --filter @workspace/api-server run seed:super-admin` instead.
 *
 * Stripe setup runs once per instance and every request waits for it. If it
 * fails, requests get a clear 503 and the next request tries again, so a bad
 * setting never turns into a crash loop.
 */

// No interval timers on Vercel: the function is frozen between requests.
enableDatabaseReadTracking({ flush: "lazy" });

let ready: Promise<void> | null = null;

function prepare(): Promise<void> {
  ready ??= initStripe()
    .then((stripeMode) => {
      logger.info({ stripeMode, target: deploymentTarget() }, "Stripe ready");
    })
    .catch((err: unknown) => {
      ready = null;
      throw err;
    });
  return ready;
}

// Start setup as soon as the instance loads; a failure is reported per request.
prepare().catch((err) => logger.error({ err }, "Stripe initialisation failed"));

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Vercel's Node helpers pre-parse req.body, which breaks the raw-body
  // signature checks for Stripe and Resend webhooks. They must be turned off
  // with the project variable NODEJS_HELPERS=0.
  if (Object.prototype.hasOwnProperty.call(req, "body")) {
    logger.error("Vercel Node helpers are on; set NODEJS_HELPERS=0 in the Vercel project");
    sendJson(res, 500, { error: "Server misconfigured: set NODEJS_HELPERS=0 in the Vercel project." });
    return;
  }
  try {
    await prepare();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "request refused: server setup failed");
    sendJson(res, 503, { error: `Server setup failed: ${message}` });
    return;
  }
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
