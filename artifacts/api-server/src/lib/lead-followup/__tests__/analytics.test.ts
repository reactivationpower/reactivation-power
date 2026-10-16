import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  guard: vi.fn(), staff: vi.fn(), where: vi.fn(), eq: vi.fn(),
}))
vi.mock('../access', () => ({ requireLeadFollowUp: mock.guard }))
vi.mock('@/lib/data/participants', () => ({ getStaffMembers: mock.staff }))
vi.mock('drizzle-orm', () => ({ eq: mock.eq }))
vi.mock('@workspace/db', () => ({
  leadCallsTable: { ownerId: 'owner-column', callerId: 'caller', disposition: 'disposition' },
  db: { select: () => ({ from: () => ({ where: mock.where }) }) },
}))
import { aggregateLeadCallers, loadLeadAnalytics } from '../analytics'

const owner = { id: 'owner', first_name: 'Office', last_name: 'Owner', role: 'owner' as const, is_active: true }
const caller = { ...owner, id: 'caller', first_name: 'Caller', role: 'staff' as const }
const idle = { ...caller, id: 'idle', first_name: 'Idle', is_active: false }
beforeEach(() => {
  vi.clearAllMocks()
  mock.guard.mockResolvedValue({ participant: owner, ownerId: owner.id, isOwner: true })
  mock.staff.mockResolvedValue([caller, idle])
  mock.where.mockResolvedValue([])
})

describe('lead analytics', () => {
  it('includes owner, inactive and zero-activity callers', () => {
    const rows = aggregateLeadCallers([owner, caller, idle], [])
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.calls === 0 && !r.qualified)).toBe(true)
    expect(rows.find(r => r.id === 'owner')?.isOwner).toBe(true)
  })
  it('keeps confirmations and reschedules separate without creating bookings or diluting close rate', () => {
    const rows = aggregateLeadCallers([caller], ['booked', 'confirmed', 'rescheduled', 'no_answer', 'voicemail', 'do_not_call']
      .map(disposition => ({ callerId: caller.id, disposition })))
    expect(rows[0]).toMatchObject({ calls: 6, conversations: 3, booked: 1, confirmed: 1, rescheduled: 1,
      bookingConversations: 1, closeRate: 100, answerRate: 50, qualified: false })
  })
  it('ranks qualified callers above lucky one-call results; ties break by bookings', () => {
    const rows = aggregateLeadCallers([owner, caller], [
      { callerId: owner.id, disposition: 'booked' },
      ...['booked', 'booked', 'callback_later'].map(disposition => ({ callerId: caller.id, disposition })),
    ])
    expect(rows.map(r => r.id)).toEqual(['caller', 'owner'])
    expect(rows[0]).toMatchObject({ qualified: true, closeRate: 67 })
  })
  it('retains historical unattributed calls in totals', () => {
    expect(aggregateLeadCallers([], [{ callerId: null, disposition: 'booked' }])[0]).toMatchObject({ calls: 1, booked: 1, active: false })
  })
  it('scopes database reads and roster to the authenticated owner', async () => {
    await loadLeadAnalytics()
    expect(mock.guard).toHaveBeenCalledWith('/portal/leads/analytics')
    expect(mock.staff).toHaveBeenCalledWith('owner')
    expect(mock.eq).toHaveBeenCalledWith('owner-column', 'owner')
  })
  it('rejects staff before reading any analytics', async () => {
    mock.guard.mockResolvedValue({ participant: caller, ownerId: owner.id, isOwner: false })
    await expect(loadLeadAnalytics()).rejects.toMatchObject({ location: '/portal/leads' })
    expect(mock.where).not.toHaveBeenCalled()
    expect(mock.staff).not.toHaveBeenCalled()
  })
  it('propagates product, sign-in and billing guard rejection before data access', async () => {
    mock.guard.mockRejectedValue(new Error('Access denied'))
    await expect(loadLeadAnalytics()).rejects.toThrow('Access denied')
    expect(mock.where).not.toHaveBeenCalled()
  })
})