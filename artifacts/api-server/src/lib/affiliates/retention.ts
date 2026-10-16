import { pool, type PoolClient } from '@workspace/db'
import { deleteInBatches, RETENTION_BATCH } from '@/lib/batched-delete'
import { pastDeadline } from '@/lib/cron/budget'

/**
 * Call with an isolated client in tests. Financial and administrative audit rows are never removed here.
 * Works in batches under a cron time budget; `incomplete: true` means more is left for the next run.
 */
export async function cleanupAffiliateTelemetry(client: Pick<PoolClient, 'query'> = pool, opts: { deadline?: number } = {}) {
  const state = { incomplete: false }
  let anonymized = 0
  while (!pastDeadline(opts.deadline, 2_000)) {
    const ips = await client.query(`UPDATE affiliate_activity SET ip=NULL,country=NULL,region=NULL
      WHERE occurred_at<now()-interval '30 days' AND (ip IS NOT NULL OR country IS NOT NULL OR region IS NOT NULL)
      AND ctid IN (SELECT ctid FROM affiliate_activity WHERE occurred_at<now()-interval '30 days'
        AND (ip IS NOT NULL OR country IS NOT NULL OR region IS NOT NULL) LIMIT ${RETENTION_BATCH})`)
    anonymized += ips.rowCount ?? 0
    if ((ips.rowCount ?? 0) < RETENTION_BATCH) break
  }
  if (pastDeadline(opts.deadline, 2_000)) state.incomplete = true
  const navigation = await deleteInBatches(client, 'affiliate_activity', "telemetry=true AND occurred_at<now()-interval '90 days'", opts.deadline, state)
  const sessions = await deleteInBatches(client, 'affiliate_sessions', "expires_at<now()-interval '1 day'", opts.deadline, state)
  const challenges = await deleteInBatches(client, 'affiliate_challenges', "expires_at<now()-interval '1 day'", opts.deadline, state)
  return { anonymized, navigationDeleted: navigation, sessionsDeleted: sessions, challengesDeleted: challenges, ...(state.incomplete ? { incomplete: true } : {}) }
}
