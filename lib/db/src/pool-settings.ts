import pg from "pg";
export const RuntimePool = pg.Pool;

/** Where this process runs. Vercel sets VERCEL=1 and VERCEL_ENV on every deployment. */
export function poolHost(env: NodeJS.ProcessEnv = process.env): "replit" | "vercel-production" | "vercel-preview" {
  if (!env.VERCEL) return "replit";
  return env.VERCEL_ENV === "production" ? "vercel-production" : "vercel-preview";
}

/**
 * Per-process pool limits. Every Node process importing the DB library owns one
 * pool against the Supabase Session pooler, where each pooled client holds one
 * of the project's sessions, so the defaults stay small everywhere.
 *
 * Vercel (Fluid compute) keeps the same size: one instance serves many
 * concurrent requests through one pool, and the instance count is what grows.
 * Its idle timeout is shorter (Vercel's guidance is about 5 seconds) because
 * the pool-cleanup helper keeps the instance awake for exactly that long after
 * the last release, so idle sessions close before the instance is suspended.
 * All three limits can be overridden per environment (see docs/vercel-hosting.md).
 */
export function runtimePoolSettings(env: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  const integer = (key: string, fallback: number, max: number) => {
    const raw = env[key];
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
      throw new Error(`${key} must be a positive integer no greater than ${max}`);
    }
    return Number(raw);
  };
  const host = poolHost(env);
  const nodeEnv = env.NODE_ENV === "test" ? "test" : env.NODE_ENV === "production" ? "production" : "development";
  return {
    max: integer("DB_POOL_MAX", 2, 15),
    connectionTimeoutMillis: integer("DB_POOL_ACQUIRE_TIMEOUT_MS", 5000, 60000),
    idleTimeoutMillis: integer("DB_POOL_IDLE_TIMEOUT_MS", host === "replit" ? 10000 : 5000, 300000),
    application_name: `patient-pipeline:${nodeEnv}:${host}:${process.pid}`,
  };
}
