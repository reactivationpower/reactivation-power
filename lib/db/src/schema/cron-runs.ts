import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * One row per scheduled-job run (billing retry, demo reset). The in-process
 * scheduler claims a run by inserting the (job, due_key) pair — the unique
 * index is what stops two autoscale instances from running the same day's
 * job twice. Manual and HTTP-triggered runs have no due_key.
 */
export const cronRunsTable = pgTable(
  "cron_runs",
  {
    id: text("id").primaryKey(),
    job: text("job").notNull(), // billing-retry | demo-reset
    /** ET calendar day (YYYY-MM-DD) this scheduled run is for; null for manual runs. */
    dueKey: text("due_key"),
    trigger: text("trigger").notNull(), // scheduler | http | admin
    status: text("status").notNull(), // running | ok | failed
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    error: text("error"),
    actor: text("actor"),
  },
  (t) => [
    uniqueIndex("cron_runs_job_due_key_idx").on(t.job, t.dueKey),
    index("cron_runs_job_started_idx").on(t.job, t.startedAt),
  ],
);

export type CronRun = typeof cronRunsTable.$inferSelect;
export type NewCronRun = typeof cronRunsTable.$inferInsert;
