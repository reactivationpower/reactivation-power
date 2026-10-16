import { configureDatabaseReadTracking } from "@workspace/db";
import { logger } from "./logger";
import { tryGetRequestContext } from "./request-context";
import { seal, unseal } from "./affiliates/onboarding-crypto";

/**
 * Shared by the Replit server entry and the Vercel function entry. The Replit
 * process flushes on a five-minute timer; a Vercel function is frozen between
 * requests, so there the report is flushed lazily by the first query after a
 * window ends instead (no timer may be relied on).
 */
export function enableDatabaseReadTracking(options: { flush?: "interval" | "lazy" } = {}): void {
  configureDatabaseReadTracking(
    report => logger.info(report, "Database read usage (estimated result bytes)"),
    () => {
      const request = tryGetRequestContext()?.req;
      // Express route templates only: never raw paths, tokens or query strings.
      return request && typeof request.route?.path === "string"
        ? `${request.method} ${request.route.path}`
        : "background";
    },
    options,
  );
}

/**
 * Exercise the effective encryption configuration without exposing the key,
 * ciphertext, or any affiliate data in logs. Returns true when it works.
 */
export function checkOnboardingEncryption(): boolean {
  try {
    const probe = Buffer.from("onboarding configuration check");
    if (!unseal(seal(probe, "configuration-check", "probe"), "configuration-check", "probe").equals(probe)) {
      throw new Error("Encryption round trip failed");
    }
    logger.info("Affiliate onboarding encryption ready");
    return true;
  } catch {
    logger.warn("Affiliate onboarding encryption unavailable; secure submissions remain blocked");
    return false;
  }
}
