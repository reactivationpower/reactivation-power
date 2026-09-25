import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ current: vi.fn(), change: vi.fn(), welcome: vi.fn() }))
vi.mock('@/lib/data/participants', () => ({ getCurrentParticipant: mock.current, accessOwnerId: (p: any) => p.parent_id ?? p.id }))
vi.mock('@/lib/mail', () => ({ sendPortalWelcomeEmail: mock.welcome }))
vi.mock('@/lib/data/caller-seats', () => ({ changeCallerSeat: mock.change }))
import { addTeamMember, setTeamMemberActive } from '../reactivation'
beforeEach(() => {
  vi.clearAllMocks()
  mock.current.mockResolvedValue({ id: 'owner', role: 'owner', first_name: 'Owner', last_name: 'Name' })
})
function form() {
  const fd = new FormData()
  fd.set('firstName', 'Test'); fd.set('lastName', 'Caller'); fd.set('email', 'caller@example.com')
  return fd
}
it('uses authenticated owner for add/reactivate and sends welcome only after committed insert', async () => {
  mock.change.mockResolvedValue({ id: 'new-caller' })
  await addTeamMember(form())
  expect(mock.change).toHaveBeenCalledWith('owner', expect.objectContaining({ kind: 'add' }))
  expect(mock.welcome).toHaveBeenCalledWith(expect.objectContaining({ participantId: 'new-caller', source: 'portal' }))
  await setTeamMemberActive('caller', true)
  expect(mock.change).toHaveBeenLastCalledWith('owner', { kind: 'active', memberId: 'caller', active: true })
})
it('does not allow staff to manage seats', async () => {
  mock.current.mockResolvedValue({ id: 'caller', parent_id: 'owner', role: 'staff' })
  expect(await addTeamMember(form())).toHaveProperty('error')
  expect(await setTeamMemberActive('other', false)).toHaveProperty('error')
  expect(mock.change).not.toHaveBeenCalled()
})
it('propagates cap failures without inviting the caller', async () => {
  mock.change.mockResolvedValue({ error: 'You can have up to 5 active callers.' })
  expect(await addTeamMember(form())).toHaveProperty('error')
  expect(mock.welcome).not.toHaveBeenCalled()
})