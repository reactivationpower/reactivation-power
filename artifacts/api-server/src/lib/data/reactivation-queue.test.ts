import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuePatient } from '../patients/queue-read'

const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), insert: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { query: mocks.query } }))
vi.mock('../patients/queue-read', async importOriginal => ({
  ...await importOriginal<typeof import('../patients/queue-read')>(),
  readQueuePatients: mocks.read,
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'follow_ups') return { insert: mocks.insert }
      const chain = {
        select: () => chain, order: () => chain, eq: () => chain, in: () => chain,
        then: (resolve: (value: unknown) => void) => resolve({ data: table === 'niches'
          ? [{ id: 'n', is_active: true, name: 'Test' }] : [{ niche_id: 'n' }] }),
      }
      return chain
    },
  }),
}))

import { getCallQueueState, releaseReserveContacts } from './reactivation'

const now = Date.now()
function patient(id: string, extra: Partial<QueuePatient> = {}): QueuePatient {
  return {
    id, niche_id: 'n', do_not_call: false, first_call_at: null, created_at: new Date(now).toISOString(),
    services: [], last_call: null, next_follow_up: null,
    plan: { service: { id: `s-${id}`, niche_id: 'n', last_visit: null, outreach_status: 'ready' },
      context: 'initial', blocked: null, dueAt: new Date(now - 1000).toISOString() },
    ...extra,
  }
}
function followed(id: string, reason = 'initial', context = 'initial', due = now - 1000) {
  const p = patient(id)
  p.plan.context = context as QueuePatient['plan']['context']
  p.plan.dueAt = new Date(due).toISOString()
  p.next_follow_up = {
    id: `f-${id}`, contact_id: id, reason: reason as 'initial',
    due_at: new Date(due).toISOString(), created_at: new Date(now).toISOString(), completed_call_id: null,
  }
  return p
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.insert.mockResolvedValue({ error: null })
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    const ids = params[1] as string[]
    if (sql.includes('FROM contacts c')) return { rows: ids.map(id => ({
      id, owner_id: 'owner', name: id, phone: '2125550100', niche_id: 'n',
      created_at: new Date(now), first_call_at: null, do_not_call: false,
      call_count: 0, last_call: null, niche: { id: 'n' }, stage: null,
    })) }
    if (sql.includes('FROM contact_services s')) return { rows: ids.map(id => ({
      id: `s-${id}`, contact_id: id, niche_id: 'n', service_label: 'Selected service',
      original_complaint: 'Selected concern', last_visit: null, outreach_status: 'ready',
    })) }
    throw new Error(`Unexpected queue query: ${sql}`)
  })
})

describe('bounded queue hydration and batch release', () => {
  it('hydrates only the next oldest batch, counts the full reserve, and does not ensure services on refresh', async () => {
    mocks.read.mockResolvedValue(Array.from({ length: 10000 }, (_, i) => patient(String(i))))
    const state = await getCallQueueState('owner', 20)
    expect(state.waiting).toBe(9980)
    expect(state.newCalls.map(q => q.contact.id)).toEqual(Array.from({ length: 20 }, (_, i) => String(9999 - i)))
    expect(state.followUps).toEqual([])
    expect(mocks.query).toHaveBeenCalledTimes(2)
    for (const [, params] of mocks.query.mock.calls) expect(params[1]).toHaveLength(20)
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(state.newCalls[0]!.contact.service_label).toBe('Selected service')
  })
  it('does not top up a live initial batch; promised and routine follow-ups remain unthrottled and ordered', async () => {
    const pending = [
      followed('cold'), followed('callback', 'manual', 'callback', now - 5000),
      followed('confirmation', 'manual', 'confirmation', now - 6000),
      followed('retry', 'retry', 'retry', now - 3000),
    ]
    mocks.read.mockResolvedValue([...pending, ...Array.from({ length: 1000 }, (_, i) => patient(`reserve-${i}`))])
    const state = await getCallQueueState('owner', 1)
    expect(state.followUps.map(q => q.contact.id)).toEqual(['confirmation', 'callback', 'retry'])
    expect(state.followUps.map(q => q.follow_up.call_context)).toEqual(['confirmation', 'callback', 'retry'])
    expect(state.newCalls.map(q => q.contact.id)).toEqual(['cold'])
    expect(state.waiting).toBe(1000)
    expect(mocks.insert).not.toHaveBeenCalled()
    for (const [, params] of mocks.query.mock.calls) expect(params[1]).toHaveLength(4)
  })
  it('does not display blocked/future patients or release treatment-held reserve; preserves exact promised times', async () => {
    const callback = followed('promised', 'manual', 'callback', now - 100)
    const blocked = followed('blocked')
    blocked.plan.blocked = 'Declined'
    const held = patient('recent-treatment')
    held.plan.dueAt = new Date(now + 120 * 86400000).toISOString()
    const future = followed('future', 'quarterly', 'rotation', now + 120 * 86400000)
    mocks.read.mockResolvedValue([callback, blocked, held, future])
    const state = await getCallQueueState('owner', 20)
    expect(state.waiting).toBe(0)
    expect(state.followUps.map(q => q.contact.id)).toEqual(['promised'])
    expect(state.followUps[0]!.follow_up.due_at).toBe(callback.plan.dueAt)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('manual Add More hydrates and releases only the requested eligible reserve', async () => {
    mocks.read.mockResolvedValue([patient('newest'), patient('middle'), patient('oldest')])
    expect(await releaseReserveContacts('owner', 2)).toBe(2)
    expect(mocks.insert.mock.calls[0]![0].map((f: { contact_id: string }) => f.contact_id)).toEqual(['oldest', 'middle'])
    for (const [, params] of mocks.query.mock.calls) expect(params[1]).toEqual(['oldest', 'middle'])
  })
})
