import { configureDatabaseReadTracking } from "@workspace/db";
import { logger } from "./logger";
import { tryGetRequestContext } from "./request-context";
import { seal, unseal } from "./affiliates/onboarding-crypto";

/** Shared by the Replit server entry and the Vercel function entry. */
export function enableDatabaseReadTracking(): void {
  configureDatabaseReadTracking(
    report => logger.info(report, "Database read usage (estimated result bytes)"),
    () => {
      const request = tryGetRequestContext()?.req;
      // Express route templates only: never raw paths, tokens or query strings.
      return request && typeof request.route?.path === "string"
        ? `${request.method} ${request.route.path}`
        : "background";
    },
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
