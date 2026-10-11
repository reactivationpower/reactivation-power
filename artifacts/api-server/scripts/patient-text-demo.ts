/**
 * Explicit operator-only synthetic run. No seed/reset of existing campaign/call data.
 * Bundled with the API aliases; never invoked by an HTTP request or scheduler.
 */
import { randomUUID } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { db } from '@workspace/db'
import { sql } from 'drizzle-orm'
import { startSimulation, changeSimulation, savePolicy, readPolicy, readSimulation, budgetStatus } from '../src/lib/patient-texting/store'

const result = await db.execute(sql`
  SELECT l.id, l.owner_id FROM campaign_leads l
  JOIN participants p ON p.id::text = l.owner_id
  JOIN lead_campaigns c ON c.id = l.campaign_id AND c.owner_id = l.owner_id
  WHERE p.is_demo AND p.first_name = 'Daniel' AND p.last_name = 'Whitaker'
    AND l.first_name = 'Melissa' AND l.last_name = 'Tran'
    AND l.email = 'melissa.tran@example.com' AND l.phone_key = '7205550186'
    AND c.status = 'active'`)
if (result.rows.length !== 1) throw new Error('Expected one verified existing fictional lead; did not modify any data.')
const { id: leadId, owner_id: ownerId } = result.rows[0] as { id: string; owner_id: string }
console.log('Verified existing fictional demo lead; no database reseed.')
if (process.argv.includes('--export-only')) {
  const record = await readSimulation(ownerId, leadId)
  if (!record) throw new Error('No saved simulation to export.')
  const budget = await budgetStatus()
  await mkdir('../../generated-artifacts/patient-texting', { recursive: true })
  await writeFile('../../generated-artifacts/patient-texting/whitaker-transcript.json', JSON.stringify({
    route: `/portal/campaigns/${record.state.campaignId}/leads/${leadId}`, budget, state: record.state,
  }, null, 2))
  console.log('Saved existing transcript export; no model calls or message changes.')
  process.exit(0)
}
const prior = await readSimulation(ownerId, leadId)
if (prior?.state.messages.length) {
  // Retry only an initial failed model attempt, not a completed or partially successful run.
  if (prior.state.messages.some(m => m.source === 'model') && !process.argv.includes('--replay')) throw new Error('Existing transcript preserved; use UI reset deliberately before a new scripted run.')
  if (process.argv.includes('--replay')) {
    await mkdir('../../generated-artifacts/patient-texting', { recursive: true })
    await writeFile(`../../generated-artifacts/patient-texting/prior-${Date.now()}.json`, JSON.stringify(prior.state, null, 2))
  }
  await changeSimulation(ownerId, leadId, { kind: 'reset', eventId: randomUUID() })
}
const policy = await readPolicy(ownerId)
await savePolicy(ownerId, ownerId, { ...policy, afterHours: true })
await startSimulation(ownerId, leadId)
const turns = [
  'Hi, I filled out the Facebook form about my back. Is this an automated text?',
  'Thanks for saying so. I am not sure yet—I mostly wanted to understand the offer.',
  'What exactly is included in the $49?',
  'Wait, sorry, my kid interrupted me. Is that $49 for each of those things or the whole first-visit offer?',
  'And what was the regular price? Are you promising it is still available this weekend?',
  'I think Tuesday afternoon would work. I cannot commit to an exact time yet.',
  'Actually, correction: Tuesday is impossible. Wednesday after 3 would be better.',
  'Please do not book anything yet. Can you keep Wednesday after 3 as just my preference?',
  'What if I can only do Thursday morning instead? Keep that as my backup.',
  'I have Aetna. Does that cover this, and would an adjustment be appropriate if I have a disc problem?',
  'Yes, I would like a human to follow up when the office opens. Wednesday after 3 is first choice, Thursday morning backup.',
]
for (let i = 0; i < turns.length; i++) {
  const state = await changeSimulation(ownerId, leadId, { kind: 'patient', text: turns[i], eventId: randomUUID() })
  console.log(`Turn ${i + 1}: ${state?.ownership}; ${state?.messages.at(-1)?.source}; ${state?.messages.at(-1)?.delivery}; ${state?.reason ?? ''}`)
  if (i < 9 && state?.ownership !== 'ai') throw new Error('AI stopped early; inspect saved transcript without retrying paid calls.')
}
await changeSimulation(ownerId, leadId, { kind: 'clock', clock: '2026-10-12T15:00:00.000Z', eventId: randomUUID() })
await changeSimulation(ownerId, leadId, { kind: 'takeover', eventId: randomUUID() })
const final = await readSimulation(ownerId, leadId)
const budget = await budgetStatus()
await mkdir('../../generated-artifacts/patient-texting', { recursive: true })
await writeFile('../../generated-artifacts/patient-texting/whitaker-transcript.json', JSON.stringify({ route: `/portal/campaigns/${final!.state.campaignId}/leads/${leadId}`, budget, state: final!.state }, null, 2))
console.log(JSON.stringify({ route: `/portal/campaigns/${final!.state.campaignId}/leads/${leadId}`, budget, messages: final!.state.messages.length, ownership: final!.state.ownership }))
process.exit(0)
