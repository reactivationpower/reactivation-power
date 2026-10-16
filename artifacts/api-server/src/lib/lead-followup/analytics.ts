import { eq } from 'drizzle-orm'
import { db, leadCallsTable } from '@workspace/db'
import { redirect } from 'next/navigation'
import { MIN_NICHE_CONVERSATIONS } from '@workspace/shared/analytics-types'
import type { Participant } from '@workspace/shared/types'
import { getStaffMembers } from '@/lib/data/participants'
import { requireLeadFollowUp } from './access'

type Member = Pick<Participant, 'id' | 'first_name' | 'last_name' | 'role' | 'is_active'>
type Call = { callerId: string | null; disposition: string }
const CONVERSATIONS = new Set(['spoke_did_not_book', 'callback_later', 'booked', 'confirmed', 'rescheduled', 'booked_elsewhere'])
const pct = (n: number, d: number) => d ? Math.round(n / d * 100) : 0

/** Calls are activity, not unique patients. Confirmation/reschedule follow-ups
 * are reported separately and never create another booking or dilute close rate. */
export function aggregateLeadCallers(members: Member[], calls: Call[]) {
  const rows = new Map(members.map(m => [m.id, {
    id: m.id, name: `${m.first_name} ${m.last_name}`.trim(), isOwner: m.role === 'owner',
    active: m.is_active, calls: 0, conversations: 0, bookingConversations: 0,
    booked: 0, confirmed: 0, rescheduled: 0, voicemails: 0, doNotCall: 0,
  }]))
  for (const c of calls) {
    const key = c.callerId ?? 'unattributed'
    if (!rows.has(key)) rows.set(key, { id: key, name: 'Former / unknown caller', isOwner: false, active: false,
      calls: 0, conversations: 0, bookingConversations: 0, booked: 0, confirmed: 0, rescheduled: 0, voicemails: 0, doNotCall: 0 })
    const row = rows.get(key)!
    row.calls++
    if (CONVERSATIONS.has(c.disposition)) row.conversations++
    if (CONVERSATIONS.has(c.disposition) && !['confirmed', 'rescheduled'].includes(c.disposition)) row.bookingConversations++
    if (c.disposition === 'booked') row.booked++
    if (c.disposition === 'confirmed') row.confirmed++
    if (c.disposition === 'rescheduled') row.rescheduled++
    if (c.disposition === 'voicemail') row.voicemails++
    if (c.disposition === 'do_not_call') row.doNotCall++
  }
  return [...rows.values()].map(r => ({ ...r, answerRate: pct(r.conversations, r.calls),
    closeRate: pct(r.booked, r.bookingConversations), qualified: r.bookingConversations >= MIN_NICHE_CONVERSATIONS }))
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.closeRate - a.closeRate ||
      b.booked - a.booked || b.bookingConversations - a.bookingConversations || a.name.localeCompare(b.name))
}

export async function loadLeadAnalytics() {
  const { participant, ownerId, isOwner } = await requireLeadFollowUp('/portal/leads/analytics')
  if (!isOwner) redirect('/portal/leads')
  const [staff, calls] = await Promise.all([
    getStaffMembers(ownerId),
    db.select({ callerId: leadCallsTable.callerId, disposition: leadCallsTable.disposition })
      .from(leadCallsTable).where(eq(leadCallsTable.ownerId, ownerId)),
  ])
  return { callers: aggregateLeadCallers([participant, ...staff], calls), minimumConversations: MIN_NICHE_CONVERSATIONS }
}