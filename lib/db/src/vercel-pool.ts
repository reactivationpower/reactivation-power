import { attachDatabasePool } from "@vercel/functions";
import type pg from "pg";

/**
 * Vercel suspends a Fluid compute instance as soon as its last response ends.
 * pg's idle timer does not run while suspended, so an idle client would keep
 * its Supabase session until the instance is destroyed or the pooler closes
 * it ("phantom" sessions after a deploy or a traffic spike).
 *
 * attachDatabasePool registers a `release` listener that asks Vercel to keep
 * the instance awake (waitUntil) for idleTimeoutMillis + 100 ms after each
 * release, which is long enough for pg's own idle timer to close the client.
 * Busy clients are untouched, so a client holding a session advisory lock or
 * an open transaction is never closed under the code that owns it.
 *
 * Off Vercel (Replit, scripts, tests) nothing is attached: the process is
 * long-lived and pg's idle timer already runs.
 */
export function attachVercelPoolCleanup(pool: pg.Pool, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.VERCEL) return false;
  attachDatabasePool(pool);
  return true;
}
