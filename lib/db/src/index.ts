import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
export type { PoolClient } from "pg";
import * as schema from "./schema";
import { runtimePoolSettings } from "./pool-settings";
import { trackDatabasePool } from "./read-tracking";
export { configureDatabaseReadTracking, flushDatabaseReadTracking } from "./read-tracking";
export { runtimePoolSettings } from "./pool-settings";
export { isDatabaseUnavailable, DATABASE_UNAVAILABLE_MESSAGE } from "./capacity";

const { Pool } = pg;

/**
 * All application tables live in the project's Supabase Postgres. The app
 * connects server-side through the Supabase pooler with SUPABASE_DB_URL
 * (Project Settings → Database → Connection string, Session pooler URI).
 * There is no fallback: a missing URL is a configuration error, not a
 * reason to fall back to another database.
 */
export function supabaseDbUrl(): string {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL must be set to the Supabase Postgres connection string (Session pooler URI). All app tables live in Supabase.",
    );
  }
  return url;
}

/**
 * Supabase's pooler presents a certificate signed by Supabase's own CA, which
 * Node does not trust by default. Encryption is still on; only chain
 * verification is skipped, unless the URL opts out with sslmode=disable
 * (never the case for Supabase, kept for local tooling).
 */
export function poolConfig(url = supabaseDbUrl()): pg.PoolConfig {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  parsed.searchParams.delete("sslmode");
  return {
    ...runtimePoolSettings(),
    connectionString: parsed.toString(),
    ssl: sslmode === "disable" ? false : { rejectUnauthorized: false },
  };
}

export const pool = new Pool(poolConfig());
trackDatabasePool(pool);
// pg removes broken idle clients before emitting; a listener prevents a process crash.
// Never log the driver message/connection object, which may contain credentials or SQL.
pool.on("error", (error: Error & { code?: string }) => {
  console.error(JSON.stringify({ event: "database_idle_client_error", code: error.code,
    total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }));
});
export const db = drizzle(pool, { schema });

export * from "./schema";
