import { pool, flushDatabaseReadTracking } from "@workspace/db";
import { logger } from "./lib/logger";
import { seedSuperAdmin } from "./lib/data/admin-users";
import { checkOnboardingEncryption } from "./lib/startup";

/**
 * One-off setup check, run on purpose instead of on every cold start:
 *   pnpm --filter @workspace/api-server run build
 *   pnpm --filter @workspace/api-server run seed:super-admin
 *
 * Creates the first super admin from SUPER_ADMIN_EMAIL only while the project
 * has none (safe to run again: it does nothing once one exists), and checks
 * that affiliate onboarding encryption works. Uses the same environment
 * variables as the server.
 */
async function main(): Promise<number> {
  const encryptionReady = checkOnboardingEncryption();
  const outcome = await seedSuperAdmin(logger);
  logger.info({ outcome, encryptionReady }, "setup check finished");
  return 0;
}

main()
  .catch((err) => {
    logger.error({ err }, "super admin seed failed");
    return 1;
  })
  .then(async (code) => {
    flushDatabaseReadTracking();
    await pool.end().catch(() => {});
    process.exit(code);
  });
