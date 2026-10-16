import { leadFollowUpContextOrError } from '../lib/lead-followup/access'
import * as store from '../lib/patient-texting/store'
import { validatePolicy } from '../lib/patient-texting/policy'
import { getLead } from '../lib/lead-followup/store'
import * as live from '../lib/patient-texting/live'
import * as connections from '../lib/patient-texting/connections'

async function context(ownerOnly = false) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) throw new Error(guard.error)
  if (ownerOnly && !guard.ctx.isOwner) throw new Error('Only the office owner can change texting settings.')
  return guard.ctx
}
export async function getTextSettings() {
  const c = await context()
  return { policy: await store.readPolicy(c.ownerId), isOwner: c.isOwner, isDemo: c.participant.is_demo, mode: 'disabled',
    connections: c.isOwner ? await connections.connectionStatus(c.ownerId) : [],
    liveEnabled: false, providerReady: false, modelReady: false,
    demoModelReady: c.participant.is_demo && Boolean(process.env.PATIENT_DEMO_OPENAI_API_KEY),
    blockers: ['Office-owned provider account and direct billing not verified', 'API-enabled SMS number and registration not verified',
      'Authenticated callbacks and account mapping not commissioned', 'Recipient consent and contact-window evidence required',
      'Healthcare, privacy and AI disclosure review required', 'Office-owned direct-billed AI connection required for production'] }
}
export async function saveTextConnection(input: Parameters<typeof connections.storeConnection>[1]) {
  const c = await context(true)
  if (c.participant.is_demo) throw new Error('Do not put real office credentials into demo accounts.')
  try { await connections.storeConnection(c.ownerId, input) } catch { throw new Error('Unable to store connection. Check the office account identifier and credential, or server encryption configuration.') }
  return getTextSettings()
}
export async function revokeTextConnection(kind: string) {
  const c = await context(true)
  await connections.revokeConnection(c.ownerId, kind)
  return getTextSettings()
}
export async function saveTextSettings(input: unknown) {
  const c = await context(true)
  await store.savePolicy(c.ownerId, c.participant.id, validatePolicy(input))
  return getTextSettings()
}
export async function getTextConversation(leadId: string) {
  const c = await context()
  if (!await getLead(c.ownerId, String(leadId))) throw new Error('Lead not found.')
  return { simulation: (await store.readSimulation(c.ownerId, leadId))?.state ?? null,
    conversation: c.participant.is_demo ? null : await live.liveThread(c.ownerId, leadId),
    isOwner: c.isOwner, isDemo: c.participant.is_demo, liveEnabled: false, budget: c.participant.is_demo ? await store.budgetStatus() : null }
}
export async function openTextConversation(leadId: string) {
  const c = await context()
  if (c.participant.is_demo) throw new Error('Use the isolated simulation in demo accounts.')
  return live.openLiveThread(c.ownerId, String(leadId))
}
export async function takeTextConversation(leadId: string, note: string, eventId: string) {
  const c = await context()
  if (c.participant.is_demo) throw new Error('Use the isolated simulation.')
  if (typeof note !== 'string') throw new Error('Invalid note.')
  return live.takeLiveThread(c.ownerId, String(leadId), c.participant.id, note, String(eventId))
}
export async function saveTextEligibility(leadId: string, input: Parameters<typeof live.saveRecipientEligibility>[2]) {
  const c = await context(true)
  if (c.participant.is_demo) throw new Error('Use the isolated simulation.')
  return live.saveRecipientEligibility(c.ownerId, String(leadId), input)
}
export async function startTextSimulation(leadId: string) {
  const c = await context()
  if (!c.participant.is_demo) throw new Error('Fictional demo only.')
  return store.startSimulation(c.ownerId, String(leadId))
}
export async function changeTextSimulation(leadId: string, command: Parameters<typeof store.changeSimulation>[2]) {
  const c = await context()
  if (!c.participant.is_demo) throw new Error('Fictional demo only.')
  return store.changeSimulation(c.ownerId, String(leadId), command)
}
