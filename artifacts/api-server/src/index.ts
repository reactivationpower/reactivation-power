import app from "./app";
import { logger } from "./lib/logger";
import { seedSuperAdmin } from "./lib/data/admin-users";
import { initStripe } from "./lib/stripe";
import { startCronScheduler, stopCronScheduler } from "./lib/cron/scheduler";
import { pool, flushDatabaseReadTracking } from "@workspace/db";
import { checkOnboardingEncryption, enableDatabaseReadTracking } from "./lib/startup";

// Replit entry: a long-running server (development workspace and the Replit
// deployment). Vercel uses src/vercel.ts instead, which wraps the same app.

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

enableDatabaseReadTracking();

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initStripe()
  .then((stripeMode) => {
    logger.info({ stripeMode }, "Stripe ready");
    const server = app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      checkOnboardingEncryption();
      logger.info("Database read tracking enabled; five-minute summaries contain estimates, not patient data");
      seedSuperAdmin(logger)
        .catch((err) => logger.error({ err }, "super admin seed failed"))
        .finally(flushDatabaseReadTracking);
      startCronScheduler();
    });
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 25000);
      deadline.unref();
      try {
        await Promise.all([
          new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())),
          stopCronScheduler(),
        ]);
        await pool.end();
        flushDatabaseReadTracking();
        clearTimeout(deadline);
        process.exit(0);
      } catch {
        process.exit(1);
      }
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  })
  .catch((err) => {
    logger.error({ err }, "Stripe initialisation failed");
    process.exit(1);
  });
