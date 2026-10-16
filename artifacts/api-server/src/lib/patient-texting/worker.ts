import { and, eq, lte, sql } from 'drizzle-orm'
import { db, patientTextIntents, patientTextThreads, patientTextRecipients, campaignLeadsTable } from '@workspace/db'
import { withRecipientLock, LIVE_BLOCKED } from './live'
import { pastDeadline } from '@/lib/cron/budget'

/**
 * Durable safety reconciliation for pending intents. It never sends while live
 * commissioning is unavailable and never retries ambiguous provider submission.
 * Transactions/row locks, not process timers, own concurrency.
 */
export async function reconcileTextIntents(now = new Date(), opts: { deadline?: number } = {}) {
  const candidates = await db.select({ id: patientTextIntents.id }).from(patientTextIntents)
    .where(and(eq(patientTextIntents.status, 'pending'), lte(patientTextIntents.dueAt, now))).limit(100)
  let processed = 0
  let incomplete = false
  for (const candidate of candidates) {
    if (pastDeadline(opts.deadline, 5_000)) { incomplete = true; break } // each intent is its own transaction; the rest stay pending
    await db.transaction(async tx => {
    const [info] = await tx.select({ intent: patientTextIntents, thread: patientTextThreads, recipient: patientTextRecipients })
      .from(patientTextIntents).innerJoin(patientTextThreads, eq(patientTextThreads.id, patientTextIntents.threadId))
      .innerJoin(patientTextRecipients, eq(patientTextRecipients.id, patientTextThreads.recipientId))
      .where(eq(patientTextIntents.id, candidate.id))
    if (!info) return
    await withRecipientLock(tx, info.intent.ownerId, info.recipient.phoneKey)
    const [intent] = await tx.select().from(patientTextIntents).where(eq(patientTextIntents.id, candidate.id)).for('update')
    if (intent.status !== 'pending') return
    const [thread] = await tx.select().from(patientTextThreads).where(eq(patientTextThreads.id, intent.threadId))
    const [recipient] = await tx.select().from(patientTextRecipients).where(eq(patientTextRecipients.id, thread.recipientId))
    const calls = await tx.select({ id: campaignLeadsTable.id }).from(campaignLeadsTable).where(and(
      eq(campaignLeadsTable.ownerId, intent.ownerId), eq(campaignLeadsTable.phoneKey, recipient.phoneKey),
      sql`${campaignLeadsTable.callLeaseExpiresAt} > ${now}`,
    )).limit(1)
    const cancelled = thread.revision !== intent.revision || thread.ownership !== 'ai'
      || recipient.stopped || !recipient.consent || calls.length > 0
      || thread.ownerId !== intent.ownerId || recipient.ownerId !== intent.ownerId
    await tx.update(patientTextIntents).set({ status: cancelled ? 'cancelled' : 'blocked',
      failureReason: cancelled ? 'Ownership, consent or call eligibility changed.' : LIVE_BLOCKED }).where(eq(patientTextIntents.id, intent.id))
    processed++
  })
  }
  return { processed, sends: 0, liveEnabled: false, ...(incomplete ? { incomplete: true } : {}) }
}
