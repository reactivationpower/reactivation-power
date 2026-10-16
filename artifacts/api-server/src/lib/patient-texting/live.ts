/**
 * Dormant production ledger. No transport import, no model access, no automatic
 * thread creation from old leads. All live dispatch is structurally disabled.
 */
import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, campaignLeadsTable, patientTextRecipients as recipients,
  patientTextThreads as threads, patientTextMessages as messages, patientTextIntents as intents } from '@workspace/db'
import { nextOpening } from './policy'
import { readPolicy } from './store'
import { defaultPolicy, type TextPolicy } from './policy'
import { isStop } from './policy'
import { patientTextPolicies } from '@workspace/db'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export const LIVE_BLOCKED = 'Live patient texting is disabled. Provider ownership, callbacks, consent and healthcare review must be verified before activation.'

export async function withRecipientLock(tx: Tx, ownerId: string, phoneKey: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`patient-text/${ownerId}/${phoneKey}`}, 0))`)
}

/** New webhook submissions only; never sweeps historical/imported leads. */
export async function routeNewTextLead(tx: Tx, ownerId: string, leadId: string) {
  const [row] = await tx.select().from(patientTextPolicies).where(eq(patientTextPolicies.ownerId, ownerId))
  const policy = (row?.policy as TextPolicy) ?? defaultPolicy
  if (policy.handling === 'team' && !policy.afterHours) return
  const [lead] = await tx.select().from(campaignLeadsTable).where(and(eq(campaignLeadsTable.ownerId, ownerId), eq(campaignLeadsTable.id, leadId)))
  if (!lead) throw new Error('Lead not found.')
  await withRecipientLock(tx, ownerId, lead.phoneKey)
  await tx.insert(recipients).values({ id: randomUUID(), ownerId, phoneKey: lead.phoneKey }).onConflictDoNothing()
  const [recipient] = await tx.select().from(recipients).where(and(eq(recipients.ownerId, ownerId), eq(recipients.phoneKey, lead.phoneKey)))
  // Missing recipient consent and verified transport means team ownership, regardless
  // of office preference. Never manufacture eligibility from a campaign form.
  const [created] = await tx.insert(threads).values({ id: randomUUID(), ownerId, recipientId: recipient.id,
    leadId, campaignId: lead.campaignId, ownership: 'team', handoffReason: LIVE_BLOCKED }).onConflictDoNothing().returning()
  if (!created) return
  await tx.insert(intents).values({ id: randomUUID(), ownerId, threadId: created.id, revision: 0,
    status: 'blocked', kind: 'new_lead', dueAt: new Date(), failureReason: LIVE_BLOCKED })
}

export async function liveThread(ownerId: string, leadId: string) {
  const rows = await db.select({ thread: threads, recipient: recipients }).from(threads)
    .innerJoin(recipients, eq(recipients.id, threads.recipientId))
    .innerJoin(campaignLeadsTable, and(eq(campaignLeadsTable.ownerId, ownerId), eq(campaignLeadsTable.id, leadId),
      eq(campaignLeadsTable.phoneKey, recipients.phoneKey)))
    .where(and(eq(threads.ownerId, ownerId), eq(recipients.ownerId, ownerId))).limit(1)
  if (!rows[0]) return null
  const history = await db.select().from(messages).where(and(eq(messages.ownerId, ownerId),
    eq(messages.threadId, rows[0].thread.id))).orderBy(asc(messages.sequence))
  return { ...rows[0], messages: history, liveEnabled: false as const }
}

/** Explicit staff action only; sharing phone across campaigns reuses one thread. */
export async function openLiveThread(ownerId: string, leadId: string) {
  await db.transaction(async tx => {
    const [lead] = await tx.select().from(campaignLeadsTable).where(and(eq(campaignLeadsTable.id, leadId),
      eq(campaignLeadsTable.ownerId, ownerId)))
    if (!lead) throw new Error('Lead not found.')
    await withRecipientLock(tx, ownerId, lead.phoneKey)
    await tx.insert(recipients).values({ id: randomUUID(), ownerId, phoneKey: lead.phoneKey }).onConflictDoNothing()
    const [recipient] = await tx.select().from(recipients).where(and(eq(recipients.ownerId, ownerId), eq(recipients.phoneKey, lead.phoneKey)))
    await tx.insert(threads).values({ id: randomUUID(), ownerId, recipientId: recipient.id,
      leadId, campaignId: lead.campaignId, handoffReason: LIVE_BLOCKED }).onConflictDoNothing()
  })
  return liveThread(ownerId, leadId)
}

/** Call claims invoke this under the same person lock before acquiring a lease. */
export async function pauseForCall(tx: Tx, ownerId: string, phoneKey: string) {
  const matching = await tx.select({ id: threads.id }).from(threads)
    .innerJoin(recipients, eq(threads.recipientId, recipients.id))
    .where(and(eq(threads.ownerId, ownerId), eq(recipients.ownerId, ownerId), eq(recipients.phoneKey, phoneKey)))
  for (const t of matching) {
    await tx.update(threads).set({ ownership: 'team', revision: sql`${threads.revision} + 1`,
      handoffReason: 'Human call claimed. Text automation paused; no automatic resume.' }).where(eq(threads.id, t.id))
    await tx.update(intents).set({ status: 'cancelled', failureReason: 'Human call claimed.' })
      .where(and(eq(intents.threadId, t.id), sql`${intents.status} in ('blocked','pending','failed')`))
  }
}

export async function takeLiveThread(ownerId: string, leadId: string, actorId: string, note: string, eventId: string) {
  if (!/^[\w-]{8,100}$/.test(eventId)) throw new Error('Invalid event identifier.')
  if (note.length > 1000) throw new Error('Use no more than 1000 characters.')
  const policy = await readPolicy(ownerId)
  await db.transaction(async tx => {
    const [lead] = await tx.select().from(campaignLeadsTable).where(and(eq(campaignLeadsTable.id, leadId),
      eq(campaignLeadsTable.ownerId, ownerId)))
    if (!lead) throw new Error('Lead not found.')
    await withRecipientLock(tx, ownerId, lead.phoneKey)
    const [thread] = await tx.select({ id: threads.id }).from(threads).innerJoin(recipients, eq(recipients.id, threads.recipientId))
      .where(and(eq(threads.ownerId, ownerId), eq(recipients.phoneKey, lead.phoneKey), eq(recipients.ownerId, ownerId)))
    if (!thread) throw new Error('Open the conversation first.')
    const existing = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.ownerId, ownerId), eq(messages.eventId, eventId)))
    if (existing.length) return
    const opening = nextOpening(policy, new Date())
    await tx.update(threads).set({ ownership: 'team', revision: sql`${threads.revision} + 1`,
      handoffReason: `Staff takeover. ${LIVE_BLOCKED}`, nextOpening: opening ? new Date(opening) : null }).where(eq(threads.id, thread.id))
    await tx.update(intents).set({ status: 'cancelled', failureReason: 'Staff takeover.' })
      .where(and(eq(intents.threadId, thread.id), sql`${intents.status} in ('blocked','pending','failed')`))
    const [{ sequence }] = await tx.select({ sequence: sql<number>`coalesce(max(${messages.sequence}), 0)::int + 1` })
      .from(messages).where(eq(messages.threadId, thread.id))
    await tx.insert(messages).values({ id: randomUUID(), ownerId, threadId: thread.id, sequence,
      role: 'staff', body: note.trim() || 'Staff took over.', delivery: 'internal_note', actorId, eventId })
  })
  return liveThread(ownerId, leadId)
}

/** Never infer consent from an imported number, requested time, or a form source. */
export async function saveRecipientEligibility(ownerId: string, leadId: string, input: { consent: boolean; evidence: string; timezone: string | null; stopped: boolean }) {
  if (typeof input?.consent !== 'boolean' || typeof input.stopped !== 'boolean'
    || typeof input.evidence !== 'string' || input.evidence.length > 1000 || (input.consent && !input.evidence.trim())) throw new Error('Explicit consent evidence is required.')
  if (input.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format() } catch { throw new Error('Invalid recipient timezone.') } }
  await db.transaction(async tx => {
    const [lead] = await tx.select().from(campaignLeadsTable).where(and(eq(campaignLeadsTable.id, leadId), eq(campaignLeadsTable.ownerId, ownerId)))
    if (!lead) throw new Error('Lead not found.')
    await withRecipientLock(tx, ownerId, lead.phoneKey)
    const [recipient] = await tx.select().from(recipients).where(and(eq(recipients.ownerId, ownerId), eq(recipients.phoneKey, lead.phoneKey))).for('update')
    if (!recipient) throw new Error('Open the conversation first.')
    if (recipient.stopped && !input.stopped) throw new Error('Opt-out cannot be cleared here. Verified re-consent workflow is required.')
    await tx.update(recipients).set({ consent: input.stopped ? false : input.consent, consentEvidence: input.evidence.trim(),
      timezone: input.timezone, stopped: input.stopped, updatedAt: new Date() }).where(eq(recipients.id, recipient.id))
    if (input.stopped || !input.consent) await pauseForCall(tx, ownerId, lead.phoneKey)
  })
  return liveThread(ownerId, leadId)
}

/** Called only after account mapping and provider authentication, never an RPC. */
export async function applyAuthenticatedInbound(ownerId: string, phoneKey: string, eventId: string, body: string) {
  if (!/^\d{10,15}$/.test(phoneKey) || body.length > 1600 || !/^[\w:/-]{8,150}$/.test(eventId)) throw new Error('Invalid inbound event.')
  return db.transaction(async tx => {
    await withRecipientLock(tx, ownerId, phoneKey)
    await tx.insert(recipients).values({ id: randomUUID(), ownerId, phoneKey, stopped: isStop(body) }).onConflictDoNothing()
    const [recipient] = await tx.select().from(recipients).where(and(eq(recipients.ownerId, ownerId), eq(recipients.phoneKey, phoneKey)))
    const [thread] = await tx.select().from(threads).where(and(eq(threads.ownerId, ownerId), eq(threads.recipientId, recipient.id)))
    if (isStop(body)) {
      await tx.update(recipients).set({ stopped: true, consent: false, updatedAt: new Date() }).where(eq(recipients.id, recipient.id))
      await pauseForCall(tx, ownerId, phoneKey)
    }
    if (!thread) return { accepted: true, recorded: false, reason: 'Recipient suppression retained; no campaign conversation exists.' }
    const [duplicate] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.ownerId, ownerId), eq(messages.eventId, eventId)))
    if (duplicate) return { accepted: true, duplicate: true }
    const [{ sequence }] = await tx.select({ sequence: sql<number>`coalesce(max(${messages.sequence}), 0)::int + 1` })
      .from(messages).where(eq(messages.threadId, thread.id))
    await tx.insert(messages).values({ id: randomUUID(), ownerId, threadId: thread.id, sequence, role: 'patient', body, delivery: 'received', eventId })
    await tx.update(threads).set({ ownership: 'team', revision: sql`${threads.revision} + 1`,
      handoffReason: isStop(body) ? 'Patient opted out. All campaign texting suppressed.' : 'Patient reply needs staff review. Live AI is disabled.' }).where(eq(threads.id, thread.id))
    await tx.update(intents).set({ status: 'cancelled', failureReason: 'Patient response requires staff review.' })
      .where(and(eq(intents.threadId, thread.id), sql`${intents.status} in ('pending','blocked')`))
    return { accepted: true, recorded: true }
  })
}
