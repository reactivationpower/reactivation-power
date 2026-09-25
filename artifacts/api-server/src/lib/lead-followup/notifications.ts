import { sql } from 'drizzle-orm'
import { db } from '@workspace/db'
import { sendEmail } from '@/lib/mail'
import { appOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export interface LeadEmailSettings { enabled: boolean; recipient: string }
export const SETTINGS_UNAVAILABLE = 'Lead email settings are unavailable. Ask support to finish the database update.'

export function validateLeadEmailSettings(input: unknown): LeadEmailSettings | null {
  if (!input || typeof input !== 'object') return null
  const v = input as Record<string, unknown>
  if (typeof v.enabled !== 'boolean' || typeof v.recipient !== 'string') return null
  const recipient = v.recipient.trim().toLowerCase()
  if (recipient.length > 254 || ((v.enabled || recipient) && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(recipient))) return null
  return { enabled: v.enabled, recipient }
}

export async function readLeadEmailSettings(ownerId: string): Promise<LeadEmailSettings> {
  const result = await db.execute(sql`SELECT enabled, recipient FROM office_lead_email_settings WHERE owner_id = ${ownerId}`)
  return (result.rows[0] as unknown as LeadEmailSettings) ?? { enabled: false, recipient: '' }
}

export async function writeLeadEmailSettings(ownerId: string, settings: LeadEmailSettings) {
  await db.transaction(async tx => {
    await tx.execute(sql`INSERT INTO office_lead_email_settings (owner_id, enabled, recipient)
      VALUES (${ownerId}, ${settings.enabled}, ${settings.recipient})
      ON CONFLICT (owner_id) DO UPDATE SET enabled = excluded.enabled, recipient = excluded.recipient, updated_at = now()`)
    // Do not redirect old alerts to a newly entered address. Already-sending messages may finish.
    await tx.execute(sql`UPDATE lead_email_outbox SET status = 'cancelled', updated_at = now()
      WHERE owner_id = ${ownerId} AND status IN ('pending', 'failed')
      AND (${!settings.enabled} OR recipient <> ${settings.recipient})`)
  })
}

/** Same transaction as lead creation; savepoint isolates missing migration/queue failures. */
export async function queueLeadEmail(tx: Tx, input: { id: string; ownerId: string; campaignId: string; count: number }) {
  if (input.count < 1) return
  try {
    await tx.transaction(async nested => {
      await nested.execute(sql`INSERT INTO lead_email_outbox (id, owner_id, campaign_id, recipient, lead_count)
        SELECT ${input.id}, s.owner_id, ${input.campaignId}, s.recipient, ${input.count}
        FROM office_lead_email_settings s
        JOIN participants p ON p.id::text = s.owner_id
        WHERE s.owner_id = ${input.ownerId} AND s.enabled AND s.recipient <> '' AND NOT coalesce(p.is_demo, false)
        ON CONFLICT (id) DO NOTHING`)
    })
  } catch {
    logger.error({ ownerId: input.ownerId, eventId: input.id }, 'Lead saved but email could not be queued; check notification migration')
  }
}

interface OutboxRow {
  id: string; owner_id: string; recipient: string; campaign_id: string; lead_count: number
}

/** Leases + provider idempotency prevent concurrent sends and ambiguous retry duplicates.
 * Resend retains keys for 24h: ambiguous attempts stop after 23h for manual review.
 */
export async function deliverLeadEmails(ownerId?: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE lead_email_outbox SET status = 'expired', last_error = 'Delivery uncertain; retry window expired'
      WHERE status IN ('pending', 'sending', 'failed') AND first_attempt_at < now() - interval '23 hours'`)
    const claimed = await db.execute(sql`
      WITH candidates AS (
        SELECT o.id FROM lead_email_outbox o
        JOIN office_lead_email_settings s ON s.owner_id = o.owner_id AND s.enabled AND s.recipient = o.recipient
        JOIN participants p ON p.id::text = o.owner_id AND NOT coalesce(p.is_demo, false)
        WHERE (${ownerId ?? null}::text IS NULL OR o.owner_id = ${ownerId ?? null})
          AND o.attempts < 5
          AND (o.status = 'pending' OR (o.status IN ('failed', 'sending') AND o.updated_at < now() - interval '5 minutes'))
        ORDER BY o.created_at LIMIT 20 FOR UPDATE OF o SKIP LOCKED
      )
      UPDATE lead_email_outbox o SET status = 'sending', attempts = attempts + 1,
        updated_at = now(), first_attempt_at = coalesce(first_attempt_at, now())
      FROM candidates c WHERE o.id = c.id RETURNING o.*`)
    for (const row of claimed.rows as unknown as OutboxRow[]) {
      const result = await sendEmail('new_leads', row.recipient, {
        count: row.lead_count,
        portalUrl: `${appOrigin()}/portal/campaigns/${encodeURIComponent(row.campaign_id)}`,
      }, { idempotencyKey: `lead-email/${row.id}`, metadata: { notificationId: row.id, ownerId: row.owner_id } })
      await db.execute(sql`UPDATE lead_email_outbox SET status = ${result.ok ? 'sent' : 'failed'},
        updated_at = now(), last_error = ${result.ok ? null : 'Email provider rejected or could not confirm delivery'}
        WHERE id = ${row.id} AND status = 'sending'`)
    }
  } catch {
    logger.error('Lead email delivery unavailable; saved leads are unaffected. Check outbox and email configuration.')
  }
}