import { pool, type PoolClient } from '@workspace/db'
import { sendEmail, fromAddress } from '@/lib/mail/send'
import { renderTemplate } from '@/lib/mail/templates'
import { accessId } from './access'
import { id, transaction, type Partner } from './store'

export async function enqueueOnboarding(client: PoolClient, p: Partner, initial: boolean) {
  const jobId = id()
  const result = await client.query(`INSERT INTO affiliate_onboarding_invitations
    (id,affiliate_id,initial,recipient,business_name,access_version,entry_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
  [jobId, p.id, initial, p.email, p.business_name, p.access_version, accessId(p)])
  return result.rows[0]?.id as string | undefined
}
export async function deliverOnboarding(jobId: string): Promise<boolean> {
  // Affiliate lock ordering matches edits/revocation; never borrow a nested connection.
  const candidate = (await pool.query('SELECT affiliate_id FROM affiliate_onboarding_invitations WHERE id=$1', [jobId])).rows[0]
  if (!candidate) return false
  const row = await transaction(async client => {
    const p = (await client.query('SELECT * FROM affiliates WHERE id=$1 FOR UPDATE', [candidate.affiliate_id])).rows[0]
    const job = (await client.query('SELECT * FROM affiliate_onboarding_invitations WHERE id=$1 FOR UPDATE', [jobId])).rows[0]
    if (!job || ['accepted','cancelled','uncertain'].includes(job.status)) return null
    if (!p || p.status !== 'approved' || p.access_version !== job.access_version || p.email !== job.recipient) {
      await client.query("UPDATE affiliate_onboarding_invitations SET status='cancelled' WHERE id=$1", [jobId])
      return null
    }
    if (job.lease_until && new Date(job.lease_until) > new Date()) return null
    const evidence = (await client.query(`SELECT id,provider_id FROM email_log
      WHERE type='affiliate_onboarding_v1' AND metadata->>'invitationId'=$1 AND provider_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`, [jobId])).rows[0]
    if (evidence) {
      await client.query(`UPDATE affiliate_onboarding_invitations SET status='accepted',provider_id=$2,log_id=$3,lease_until=NULL WHERE id=$1`,
        [jobId, evidence.provider_id, evidence.id])
      return null
    }
    if (job.first_attempt_at && Date.now() - new Date(job.first_attempt_at).getTime() >= 23 * 3600_000) {
      await client.query("UPDATE affiliate_onboarding_invitations SET status='uncertain' WHERE id=$1", [jobId])
      return null
    }
    if (job.attempts >= 5) {
      if (job.status === 'sending') await client.query("UPDATE affiliate_onboarding_invitations SET status='uncertain',lease_until=NULL WHERE id=$1", [jobId])
      return null
    }
    if (new Date(job.next_attempt_at) > new Date()) return null
    let snapshot = job.delivery_snapshot
    try {
      snapshot ??= {
        ...renderTemplate('affiliate_onboarding_v1', {
          businessName: job.business_name,
          onboardingUrl: `https://patientpipeline.app/affiliates/access?next=onboarding&accessId=${encodeURIComponent(job.entry_id)}`,
        }), from: fromAddress(),
      }
    } catch {
      // Sender/render configuration failures must not strand a saved partner or retry forever.
      await client.query(`UPDATE affiliate_onboarding_invitations SET status='failed',attempts=attempts+1,
        lease_until=NULL,next_attempt_at=now()+interval '10 minutes' WHERE id=$1`, [jobId])
      return null
    }
    await client.query(`UPDATE affiliate_onboarding_invitations SET status='sending',attempts=attempts+1,delivery_snapshot=$2,
      first_attempt_at=COALESCE(first_attempt_at,now()),lease_until=now()+interval '5 minutes' WHERE id=$1`, [jobId, snapshot])
    return { ...job, delivery_snapshot: snapshot }
  })
  if (!row) return false
  // Frozen template version and persisted recipient, name and entry id keep retries identical.
  const result = await sendEmail('affiliate_onboarding_v1', row.recipient, {
    businessName: row.business_name,
    onboardingUrl: `https://patientpipeline.app/affiliates/access?next=onboarding&accessId=${encodeURIComponent(row.entry_id)}`,
  }, { idempotencyKey: `affiliate-onboarding/${row.id}`, metadata: { invitationId: row.id }, deliverySnapshot: row.delivery_snapshot })
  await pool.query(`UPDATE affiliate_onboarding_invitations SET status=$2,provider_id=$3,log_id=$4,
    lease_until=NULL,next_attempt_at=now()+interval '10 minutes' WHERE id=$1 AND status='sending'`,
  [row.id, result.ok ? 'accepted' : 'failed', result.providerId ?? null, result.logId])
  return result.ok
}
export async function retryOnboardingInvitations() {
  const rows = (await pool.query(`SELECT id FROM affiliate_onboarding_invitations
    WHERE status IN ('pending','failed','sending') AND next_attempt_at<=now()
    AND (lease_until IS NULL OR lease_until<now()) AND (attempts<5 OR status='sending') ORDER BY created_at LIMIT 20`)).rows
  let accepted = 0
  for (const row of rows) if (await deliverOnboarding(row.id)) accepted++
  return { examined: rows.length, accepted }
}
