import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db, patientTextPolicies, patientTextSimulations, patientTextBudget } from '@workspace/db'
import { getLead, getCampaign } from '../lead-followup/store'
import { getParticipantById } from '../data/participants'
import { demoPracticeByOwnerEmail } from '../demo/config'
import { getScriptFlow } from '../data/reactivation'
import { defaultPolicy, type TextPolicy, officeOpen, nextOpening, eligible, isStop, asksHuman } from './policy'
import { DemoModelError, generateReply } from './model'

export interface Message {
  id: string; role: 'patient' | 'assistant' | 'staff' | 'system'; text: string
  at: string; delivery: 'simulated' | 'received' | 'cancelled' | 'failed'
  source: 'model' | 'human' | 'rule'; modelId?: string; tokens?: number
}
export interface Simulation {
  mode: 'simulation'; leadId: string; campaignId: string; patient: string; submittedAt: string
  campaign: { name: string; offerItems: string[]; priceLineStyle: string; offerPriceCents: number | null; regularPriceCents: number | null }
  practice: string; script: unknown; policy: TextPolicy
  clock: string; recipientTimezone: string; consent: boolean; stopped: boolean
  ownership: 'ai' | 'team'; reason: string | null; nextOpening: string | null; summary?: string
  messages: Message[]; events: string[]; revision: number; pending: string | null
  reminderAt: string | null; reminded: boolean; preferences: string; processed: string[]
}
export async function readPolicy(ownerId: string) {
  const [r] = await db.select().from(patientTextPolicies).where(eq(patientTextPolicies.ownerId, ownerId))
  return (r?.policy as TextPolicy) ?? structuredClone(defaultPolicy)
}
export async function savePolicy(ownerId: string, actor: string, policy: TextPolicy) {
  await db.insert(patientTextPolicies).values({ ownerId, policy, updatedBy: actor })
    .onConflictDoUpdate({ target: patientTextPolicies.ownerId, set: { policy, updatedBy: actor, updatedAt: new Date() } })
}
export async function readSimulation(ownerId: string, leadId: string) {
  await db.execute(sql`UPDATE patient_text_simulations
    SET state = jsonb_set(jsonb_set(jsonb_set(state, '{pending}', 'null'::jsonb),
      '{ownership}', '"team"'::jsonb),
      '{reason}', '"AI response timed out; staff review required."'::jsonb), updated_at = now()
    WHERE owner_id = ${ownerId} AND lead_id = ${leadId}
      AND state->>'pending' IS NOT NULL AND updated_at < now() - interval '2 minutes'`)
  const [r] = await db.select().from(patientTextSimulations)
    .where(and(eq(patientTextSimulations.ownerId, ownerId), eq(patientTextSimulations.leadId, leadId)))
  if (!r) return null
  const state = r.state as Simulation
  if (state.ownership === 'team') {
    const patientMessages = state.messages.filter(m => m.role === 'patient')
    state.summary = `Recent patient messages, quoted without clinical interpretation:\n${patientMessages.slice(-3).map(m => `"${m.text}"`).join('\n')}`
    if (!state.preferences) {
      const preference = patientMessages.filter(m => /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(m.text)).at(-1)
      if (preference) state.preferences = `Patient stated: "${preference.text}" — pending staff confirmation, not booked.`
    }
  }
  return { id: r.id, state }
}
export async function startSimulation(ownerId: string, leadId: string) {
  const owner = await getParticipantById(ownerId)
  if (!owner?.is_demo || demoPracticeByOwnerEmail(owner.email)?.key !== 'chiro') throw new Error('Simulation is restricted to the Ridgeline fictional demo.')
  const lead = await getLead(ownerId, leadId)
  if (!lead || lead.firstName !== 'Melissa' || lead.lastName !== 'Tran' || lead.phoneKey !== '7205550186'
    || lead.email !== 'melissa.tran@example.com') throw new Error('Select the existing fictional Melissa Tran demo lead.')
  const campaign = await getCampaign(ownerId, lead.campaignId)
  if (!campaign || campaign.status !== 'active') throw new Error('The demo campaign must be active.')
  const existing = await readSimulation(ownerId, leadId)
  if (existing) return existing.state
  const policy = await readPolicy(ownerId)
  const clock = '2026-10-10T16:00:00.000Z'
  const ai = officeOpen(policy, new Date(clock)) ? policy.handling === 'ai' : policy.afterHours
  const flow = await getScriptFlow('lead')
  const relevant = (s: { niche_id: string | null }) => !s.niche_id || s.niche_id === campaign.nicheId
  const state: Simulation = {
    mode: 'simulation', leadId, campaignId: campaign.id, patient: 'Melissa Tran',
    submittedAt: lead.submittedAt.toISOString(), campaign: { name: campaign.name, offerItems: campaign.offerItems,
      priceLineStyle: campaign.priceLineStyle, offerPriceCents: campaign.offerPriceCents, regularPriceCents: campaign.regularPriceCents },
    practice: owner.practice_name ?? 'Ridgeline Chiropractic & Wellness',
    script: { steps: flow.steps.filter(relevant), choices: flow.choices.filter(relevant) },
    policy, clock, recipientTimezone: 'America/Denver', consent: true, stopped: false,
    ownership: ai ? 'ai' : 'team', reason: ai ? null : 'Team Member handling; no automation started.',
    nextOpening: nextOpening(policy, new Date(clock)), messages: [], events: ['Synthetic consent and recipient timezone fixture; no real eligibility inferred.'],
    revision: 0, pending: null, reminderAt: null, reminded: false, preferences: '', processed: [],
  }
  await db.insert(patientTextSimulations).values({ id: randomUUID(), ownerId, leadId, phoneKey: lead.phoneKey, state }).onConflictDoNothing()
  const saved = await readSimulation(ownerId, leadId)
  if (!saved) throw new Error('Another campaign already holds this simulated recipient.')
  return saved.state
}
type Command = { kind: 'patient' | 'staff' | 'takeover' | 'clock' | 'reset'; text?: string; clock?: string; eventId: string }
const message = (s: Simulation, role: Message['role'], text: string, source: Message['source']): Message => ({
  id: randomUUID(), role, text, at: s.clock, source, delivery: role === 'patient' ? 'received' : 'simulated',
})
export async function changeSimulation(ownerId: string, leadId: string, cmd: Command) {
  if (!cmd || !['patient','staff','takeover','clock','reset'].includes(cmd.kind)
    || !/^[\w-]{8,100}$/.test(cmd.eventId ?? '')) throw new Error('Invalid simulation command.')
  const text = typeof cmd.text === 'string' ? cmd.text.trim() : ''
  if ((cmd.kind === 'patient' || cmd.kind === 'staff') && (!text || text.length > 1000)) throw new Error('Enter 1–1000 characters.')
  let generation: { id: string; revision: number; state: Simulation } | null = null
  await db.transaction(async tx => {
    const [row] = await tx.select().from(patientTextSimulations).where(and(
      eq(patientTextSimulations.ownerId, ownerId), eq(patientTextSimulations.leadId, leadId))).for('update')
    if (!row) throw new Error('Start the fictional simulation first.')
    const s = row.state as Simulation
    if (s.processed.includes(cmd.eventId)) return
    if (s.processed.length >= 200 && cmd.kind !== 'reset') throw new Error('Simulation is full; reset to replay.')
    if (s.pending && (cmd.kind === 'clock' || (cmd.kind === 'patient' && !isStop(text) && !asksHuman(text)))) throw new Error('An AI reply is in progress. You can take over immediately.')
    s.revision++; s.processed.push(cmd.eventId)
    const handoff = (reason: string) => {
      s.ownership = 'team'; s.reason = reason; s.pending = null; s.reminderAt = null
      s.nextOpening = nextOpening(s.policy, new Date(s.clock)); s.events.push(`${s.clock}: ${reason}`)
    }
    if (cmd.kind === 'reset') {
      s.messages = []; s.events = ['Simulation-only reset. Calls, campaign, source submission time and usage budget unchanged.']
      s.processed = [cmd.eventId]; s.stopped = false; s.consent = true; s.preferences = ''
      s.clock = '2026-10-10T16:00:00.000Z'; s.pending = null; s.reminderAt = null; s.reminded = false
      const [policyRow] = await tx.select().from(patientTextPolicies).where(eq(patientTextPolicies.ownerId, ownerId))
      s.policy = (policyRow?.policy as TextPolicy) ?? structuredClone(defaultPolicy)
      s.ownership = (officeOpen(s.policy, new Date(s.clock)) ? s.policy.handling === 'ai' : s.policy.afterHours) ? 'ai' : 'team'
      s.reason = s.ownership === 'team' ? 'Team Member handling.' : null
      s.nextOpening = nextOpening(s.policy, new Date(s.clock))
    } else if (cmd.kind === 'takeover') handoff('Staff took over. AI paused permanently for this conversation.')
    else if (cmd.kind === 'clock') {
      const d = new Date(cmd.clock ?? '')
      if (!Number.isFinite(d.getTime()) || d < new Date(s.clock) || d > new Date('2027-10-10')) throw new Error('Advance the simulation clock within one year.')
      s.clock = d.toISOString()
      s.nextOpening = nextOpening(s.policy, d)
      s.events.push(`${s.clock}: Clock advanced; existing ownership unchanged.`)
      if (s.ownership === 'ai' && s.reminderAt && d >= new Date(s.reminderAt) && eligible(s.consent, s.stopped, s.recipientTimezone, d)) {
        if (s.reminded) handoff('One unanswered reminder exhausted. Human follow-up needed.')
        else {
          s.messages.push(message(s, 'assistant', 'Would you still like the team to follow up about this offer? Any appointment preferences remain pending staff confirmation.', 'rule'))
          s.reminded = true; s.reminderAt = new Date(d.getTime() + 24 * 3600000).toISOString()
        }
      }
    } else if (cmd.kind === 'staff') {
      if (s.stopped) throw new Error('This simulated recipient opted out. No further messages allowed.')
      if (!eligible(s.consent, s.stopped, s.recipientTimezone, new Date(s.clock))) throw new Error('Recipient consent, timezone or contact window blocks this simulated reply. You can still take over.')
      handoff('Staff composed a reply; automation cancelled.')
      s.messages.push(message(s, 'staff', text, 'human'))
    } else {
      s.messages.push(message(s, 'patient', text, 'human'))
      s.reminderAt = null
      if (isStop(text)) { s.stopped = true; s.consent = false; handoff('STOP: all simulated campaign texting for this practice/recipient suppressed.') }
      else if (asksHuman(text)) {
        // Preserve the patient's own wording for the receiving staff member.
        s.events.push(`${s.clock}: Handoff request: ${text}`)
        if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)) {
          s.preferences = `Patient stated: "${text}" — preferences only, pending staff confirmation.`
        }
        handoff(officeOpen(s.policy, new Date(s.clock)) ? 'Patient requested a team member.' : 'Patient requested a team member after hours; queued for next opening.')
      }
      else if (s.ownership === 'ai' && eligible(s.consent, s.stopped, s.recipientTimezone, new Date(s.clock))) {
        s.pending = randomUUID()
        generation = { id: row.id, revision: s.revision, state: structuredClone(s) }
      } else if (s.ownership === 'ai') handoff('Messaging eligibility blocked: consent, opt-out or recipient contact window.')
    }
    await tx.update(patientTextSimulations).set({ state: s, revision: s.revision, updatedAt: new Date() }).where(eq(patientTextSimulations.id, row.id))
  })
  if (generation) await completeGeneration(ownerId, generation)
  return (await readSimulation(ownerId, leadId))?.state
}
async function completeGeneration(ownerId: string, work: { id: string; revision: number; state: Simulation }) {
  let result: Awaited<ReturnType<typeof generateReply>> | null = null
  let failed: string | null = null
  try {
    // Reserve 2 cents before every request, including uncertain/failed calls.
    // 30k input bytes + framing and 400 output tokens costs < $0.014 at pinned model rates.
    const reserved = await db.transaction(async tx => {
      await tx.insert(patientTextBudget).values({ id: 'whitaker-demo-authorization' }).onConflictDoNothing()
      return tx.update(patientTextBudget).set({
        reservedCents: sql`${patientTextBudget.reservedCents} + 2`, calls: sql`${patientTextBudget.calls} + 1`,
      }).where(and(eq(patientTextBudget.id, 'whitaker-demo-authorization'), sql`${patientTextBudget.reservedCents} <= 98`)).returning()
    })
    if (!reserved.length) throw new DemoModelError('Demo budget exhausted.')
    result = await generateReply(work.state)
  } catch (error) { failed = error instanceof DemoModelError ? error.message : 'AI unavailable; staff review required.' }
  await db.transaction(async tx => {
    const [r] = await tx.select().from(patientTextSimulations).where(and(eq(patientTextSimulations.id, work.id),
      eq(patientTextSimulations.ownerId, ownerId))).for('update')
    if (!r) return
    const s = r.state as Simulation
    if (s.revision !== work.revision || s.pending !== work.state.pending || s.ownership !== 'ai' || s.stopped) return
    s.pending = null
    if (failed || !result) {
      s.ownership = 'team'; s.reason = failed ?? 'AI unavailable; staff review required.'
      s.messages.push({ ...message(s, 'system', s.reason, 'rule'), delivery: 'failed' })
    } else {
      s.messages.push({ ...message(s, 'assistant', result.text, 'model'), modelId: result.id, tokens: result.tokens })
      // A reply on an unrelated topic must not erase already captured preferences.
      if (result.preferences.trim()) s.preferences = result.preferences
      s.reminderAt = new Date(new Date(s.clock).getTime() + 24 * 3600000).toISOString()
      if (result.handoff) { s.ownership = 'team'; s.reason = result.handoff; s.reminderAt = null }
    }
    await tx.update(patientTextSimulations).set({ state: s, updatedAt: new Date() }).where(eq(patientTextSimulations.id, r.id))
  })
}
export async function budgetStatus() {
  const [r] = await db.select().from(patientTextBudget).where(eq(patientTextBudget.id, 'whitaker-demo-authorization'))
  return { reservedCents: r?.reservedCents ?? 0, limitCents: 100, calls: r?.calls ?? 0 }
}
