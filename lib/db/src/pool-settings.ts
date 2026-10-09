import pg from "pg";
export const RuntimePool = pg.Pool;

export function runtimePoolSettings(env: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  const integer = (key: string, fallback: number, max: number) => {
    const raw = env[key];
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
      throw new Error(`${key} must be a positive integer no greater than ${max}`);
    }
    return Number(raw);
  };
  return {
    max: integer("DB_POOL_MAX", 2, 15),
    connectionTimeoutMillis: integer("DB_POOL_ACQUIRE_TIMEOUT_MS", 5000, 60000),
    idleTimeoutMillis: integer("DB_POOL_IDLE_TIMEOUT_MS", 10000, 300000),
    application_name: `patient-pipeline:${env.NODE_ENV === "test" ? "test" : env.NODE_ENV === "production" ? "production" : "development"}:${process.pid}`,
  };
}
