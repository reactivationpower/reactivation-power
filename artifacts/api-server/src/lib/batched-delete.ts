import type { PoolClient } from '@workspace/db'
import { pastDeadline } from '@/lib/cron/budget'

/** Rows deleted per statement; small enough that one statement never holds the budget for long. */
export const RETENTION_BATCH = 5_000

/**
 * DELETE eligible rows a batch at a time until none are left or the deadline
 * is near. The eligibility condition is repeated on the outer DELETE so a row
 * that changed under us (a session touched after it was picked) is rechecked
 * on its locked version, exactly as the single-statement version did.
 */
export async function deleteInBatches(
  conn: Pick<PoolClient, 'query'>,
  table: string,
  where: string,
  deadline: number | undefined,
  state: { incomplete: boolean },
  batch = RETENTION_BATCH,
): Promise<number> {
  let deleted = 0
  for (;;) {
    if (state.incomplete || pastDeadline(deadline, 2_000)) { state.incomplete = true; return deleted }
    const result = await conn.query(
      `DELETE FROM ${table} WHERE (${where}) AND ctid IN (SELECT ctid FROM ${table} WHERE ${where} LIMIT ${batch})`,
    )
    deleted += result.rowCount ?? 0
    if ((result.rowCount ?? 0) < batch) return deleted
  }
}
