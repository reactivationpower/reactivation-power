import { and, eq, inArray } from 'drizzle-orm'
import { campaignLeadsTable, db, leadCallsTable, leadCampaignsTable } from '@workspace/db'
import { easternWallClockToUtc } from '@workspace/shared/call-time'
import type { DemoPractice } from './config'
import { demoEmail } from './config'
import { DEMO_LEAD_CAMPAIGNS } from './lead-campaign'
import { getAdminClient } from '@/lib/supabase/admin'

type Outcome = 'no_answer' | 'voicemail' | 'callback_later' | 'spoke_did_not_book' | 'booked' | 'confirmed' | 'rescheduled' | 'booked_elsewhere'
type Story = { key: string; outcomes: Outcome[] }

/** Explicit call volumes/outcomes, not precomputed analytics. The real analytics
 * query derives rates from these logged calls exactly as it does for live offices. */
const STORIES: readonly Story[] = [
  { key: 'owner', outcomes: ['no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'callback_later', 'spoke_did_not_book', 'booked', 'confirmed'] },
  { key: 'star', outcomes: [
    'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'no_answer',
    'callback_later', 'callback_later', 'spoke_did_not_book', 'spoke_did_not_book', 'booked_elsewhere',
    'booked', 'booked', 'booked', 'booked', 'booked', 'confirmed', 'rescheduled',
  ] },
  { key: 'steady', outcomes: [
    'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'no_answer', 'voicemail',
    'callback_later', 'callback_later', 'spoke_did_not_book', 'spoke_did_not_book', 'booked_elsewhere',
    'booked', 'booked', 'confirmed',
  ] },
  { key: 'developing', outcomes: [
    'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'voicemail',
    'callback_later', 'spoke_did_not_book', 'spoke_did_not_book', 'booked', 'confirmed',
  ] },
  { key: 'learning', outcomes: [
    'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer', 'voicemail', 'no_answer',
    'callback_later', 'spoke_did_not_book', 'booked_elsewhere',
  ] },
]

export function demoLeadAnalyticsPlan(practice: DemoPractice, ownerId: string, callerIds: Map<string, string>, now: Date) {
  const people = [ownerId, ...practice.callers.map(c => {
    const id = callerIds.get(c.key)
    if (!id) throw new Error(`demo ${practice.key}: missing caller ${c.key}`)
    return id
  })]
  const campaigns = DEMO_LEAD_CAMPAIGNS[practice.key].length
  return STORIES.flatMap((story, p) => story.outcomes.map((disposition, i) => {
    const index = STORIES.slice(0, p).reduce((n, s) => n + s.outcomes.length, 0) + i
    const day = 2 + (index % 22)
    const base = new Date(now.getTime() - day * 86_400_000)
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(base)
    const part = (name: string) => Number(parts.find(p => p.type === name)?.value)
    const when = easternWallClockToUtc(part('year'), part('month') - 1, part('day'), 9 + (index % 8), (index * 7) % 60)
    const followsBooking = disposition === 'confirmed' || disposition === 'rescheduled'
    const priorBookedAt = followsBooking ? new Date(when.getTime() - 86_400_000) : null
    const submittedAt = new Date((priorBookedAt ?? when).getTime() - 90 * 60_000)
    const bookedAt = ['booked', 'confirmed', 'rescheduled'].includes(disposition)
      ? new Date(when.getTime() + 3 * 86_400_000) : null
    const appointment = bookedAt
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(bookedAt)
      : null
    const id = `demo-lead-history-${practice.key}-${index + 1}`
    return {
      campaignIndex: index % campaigns,
      lead: {
        id, ownerId, firstName: 'Demo', lastName: `History ${String(index + 1).padStart(2, '0')}`,
        phone: `(202) 555-${String(100 + index).padStart(4, '0')}`,
        phoneKey: `202555${String(100 + index).padStart(4, '0')}`,
        source: 'manual', submittedAt, sourceSubmittedAt: submittedAt,
        status: disposition === 'booked' ? 'booked' : ['confirmed', 'rescheduled'].includes(disposition) ? 'confirmed' : 'closed',
        lastDisposition: disposition, lastAttemptAt: when, bookedAt,
        requestedTime: ['confirmed', 'rescheduled'].includes(disposition) ? 'Selected a time on the calendar' : null,
        requestedAt: ['confirmed', 'rescheduled'].includes(disposition)
          ? `${appointment}T14:00` : null,
        createdBy: ownerId, createdAt: submittedAt, updatedAt: when,
      },
      call: {
        id: `demo-lead-history-call-${practice.key}-${index + 1}`, leadId: id, ownerId,
        callerId: people[p], disposition, bookedAt, createdAt: when,
        notes: 'Fictional historical sales-demo call. Not an actual patient interaction.',
      },
      priorCall: followsBooking ? {
        id: `demo-lead-history-booking-${practice.key}-${index + 1}`, leadId: id, ownerId,
        callerId: people[p], disposition: 'booked' as const, bookedAt, createdAt: priorBookedAt!,
        notes: 'Fictional historical sales-demo booking. Not an actual patient interaction.',
      } : null,
    }
  }))
}

/** Idempotently add only the historical demo fixtures, without resetting a
 * practice's live demo queue or erasing anyone's in-progress demo work. */
export async function seedDemoLeadAnalyticsHistory(practice: DemoPractice, ownerId: string, callerIds: Map<string, string>) {
  const admin = getAdminClient()
  const family = [ownerId, ...practice.callers.map(c => callerIds.get(c.key))]
  const { data, error } = await admin.from('participants').select('id,email,parent_id,is_demo').in('id', family.filter((id): id is string => !!id))
  if (error) throw new Error(`Demo identity check failed: ${error.message}`)
  if (data?.length !== family.length ||
    !data.some(row => row.id === ownerId && row.email === demoEmail(practice.owner.email) && row.is_demo === true) ||
    practice.callers.some(c => !data.some(row => row.id === callerIds.get(c.key) && row.email === demoEmail(c.email) && row.parent_id === ownerId && row.is_demo === true))) {
    throw new Error(`Refusing to insert historical leads outside the ${practice.key} demo family`)
  }
  const campaigns = await db.select({ id: leadCampaignsTable.id, name: leadCampaignsTable.name })
    .from(leadCampaignsTable).where(eq(leadCampaignsTable.ownerId, ownerId))
  const expected = DEMO_LEAD_CAMPAIGNS[practice.key]
  const ids = expected.map(c => {
    const rows = campaigns.filter(row => row.name === c.name)
    if (rows.length !== 1) throw new Error(`Demo campaign missing or ambiguous: ${c.name}`)
    return rows[0].id
  })
  const plan = demoLeadAnalyticsPlan(practice, ownerId, callerIds, new Date())
  await db.transaction(async tx => {
    // The IDs are stable across repeated enrichment; an existing analytics
    // fixture is left untouched even if the owner has logged newer calls.
    const existing = await tx.select({ id: campaignLeadsTable.id }).from(campaignLeadsTable)
      .where(and(eq(campaignLeadsTable.ownerId, ownerId), inArray(campaignLeadsTable.id, plan.map(p => p.lead.id))))
    const existingIds = new Set(existing.map(row => row.id))
    const pending = plan.filter(p => !existingIds.has(p.lead.id))
    if (pending.length) {
      await tx.insert(campaignLeadsTable).values(pending.map(p => ({ ...p.lead, campaignId: ids[p.campaignIndex] })))
      await tx.insert(leadCallsTable).values(pending.flatMap(p => [
        ...(p.priorCall ? [{ ...p.priorCall, campaignId: ids[p.campaignIndex] }] : []),
        { ...p.call, campaignId: ids[p.campaignIndex] },
      ]))
    }
    // Backfill the first booking if this enrichment was previously applied
    // before confirmation/reschedule histories were made complete.
    const earlier = plan.filter(p => existingIds.has(p.lead.id) && p.priorCall)
    if (earlier.length) {
      const previous = await tx.select({ id: leadCallsTable.id }).from(leadCallsTable)
        .where(and(eq(leadCallsTable.ownerId, ownerId), inArray(leadCallsTable.id, earlier.map(p => p.priorCall!.id))))
      const present = new Set(previous.map(row => row.id))
      for (const p of earlier.filter(p => !present.has(p.priorCall!.id))) {
        const [current] = await tx.select({ createdAt: leadCallsTable.createdAt }).from(leadCallsTable)
          .where(and(eq(leadCallsTable.ownerId, ownerId), eq(leadCallsTable.id, p.call.id)))
        if (!current) throw new Error(`Missing original historical demo call ${p.call.id}`)
        const bookedCall = new Date(current.createdAt.getTime() - 86_400_000)
        await tx.update(campaignLeadsTable).set({ submittedAt: new Date(bookedCall.getTime() - 90 * 60_000) })
          .where(and(eq(campaignLeadsTable.ownerId, ownerId), eq(campaignLeadsTable.id, p.lead.id)))
        await tx.insert(leadCallsTable).values({
          ...p.priorCall!, campaignId: ids[p.campaignIndex], createdAt: bookedCall,
        })
      }
    }
  })
}