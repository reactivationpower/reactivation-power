import { beforeEach, expect, it, vi } from 'vitest'
const guard = vi.hoisted(() => vi.fn())
vi.mock('../lead-followup/access', () => ({ leadFollowUpContextOrError: guard }))
import { saveTextConnection, revokeTextConnection, saveTextSettings, saveTextEligibility } from '../../actions/patient-texting'
beforeEach(() => {
  guard.mockResolvedValue({ ok: true, ctx: { isOwner: false, ownerId: 'fixture-office', participant: { id: 'fixture-caller', is_demo: false } } })
})
it('callers cannot alter handling, credentials, revocation or eligibility', async () => {
  await expect(saveTextSettings({})).rejects.toThrow(/Only the office owner/)
  await expect(saveTextConnection({ kind: 'ai', provider: 'openai', accountId: 'test', credential: 'synthetic-credential' })).rejects.toThrow(/Only the office owner/)
  await expect(revokeTextConnection('ai')).rejects.toThrow(/Only the office owner/)
  await expect(saveTextEligibility('lead', { consent: true, stopped: false, timezone: null, evidence: 'synthetic' })).rejects.toThrow(/Only the office owner/)
})
it('unauthorized access never reaches policy writes', async () => {
  guard.mockResolvedValue({ ok: false, error: 'Unauthorized' })
  await expect(saveTextSettings({})).rejects.toThrow('Unauthorized')
})
