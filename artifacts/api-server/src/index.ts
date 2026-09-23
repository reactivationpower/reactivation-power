import app from "./app";
import { logger } from "./lib/logger";
import { seedSuperAdmin } from "./lib/data/admin-users";
import { initStripe } from "./lib/stripe";
import { startCronScheduler } from "./lib/cron/scheduler";

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
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      seedSuperAdmin(logger).catch((err) => logger.error({ err }, "super admin seed failed"));
      startCronScheduler();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Stripe initialisation failed");
    process.exit(1);
  });
