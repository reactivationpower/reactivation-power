import { pool, type PoolClient } from '@workspace/db'

/** Call with an isolated client in tests. Financial and administrative audit rows are never removed here. */
export async function cleanupAffiliateTelemetry(client: Pick<PoolClient, 'query'> = pool) {
  const ips = await client.query(`UPDATE affiliate_activity SET ip=NULL,country=NULL,region=NULL
    WHERE occurred_at<now()-interval '30 days' AND (ip IS NOT NULL OR country IS NOT NULL OR region IS NOT NULL)`)
  const navigation = await client.query(`DELETE FROM affiliate_activity WHERE telemetry=true AND occurred_at<now()-interval '90 days'`)
  const sessions = await client.query(`DELETE FROM affiliate_sessions WHERE expires_at<now()-interval '1 day'`)
  const challenges = await client.query(`DELETE FROM affiliate_challenges WHERE expires_at<now()-interval '1 day'`)
  return { anonymized: ips.rowCount, navigationDeleted: navigation.rowCount, sessionsDeleted: sessions.rowCount, challengesDeleted: challenges.rowCount }
}
