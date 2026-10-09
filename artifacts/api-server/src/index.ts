import app from "./app";
import { logger } from "./lib/logger";
import { seedSuperAdmin } from "./lib/data/admin-users";
import { initStripe } from "./lib/stripe";
import { startCronScheduler, stopCronScheduler } from "./lib/cron/scheduler";
import { pool } from "@workspace/db";
import { seal, unseal } from "./lib/affiliates/onboarding-crypto";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

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
      // Exercise the effective server configuration without exposing the key,
      // ciphertext, or any affiliate data in logs.
      try {
        const probe = Buffer.from("onboarding configuration check");
        if (!unseal(seal(probe, "configuration-check", "probe"), "configuration-check", "probe").equals(probe)) {
          throw new Error("Encryption round trip failed");
        }
        logger.info("Affiliate onboarding encryption ready");
      } catch {
        logger.warn("Affiliate onboarding encryption unavailable; secure submissions remain blocked");
      }
      seedSuperAdmin(logger).catch((err) => logger.error({ err }, "super admin seed failed"));
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
