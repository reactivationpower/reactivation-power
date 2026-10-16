import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  requests: [] as Array<{ table: string; kind?: string; filter?: string; general?: boolean; from?: number }>,
  fail: false,
  paged: false,
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const request: typeof fake.requests[number] = { table }
      const q = {
        select: () => q,
        eq: (_: string, kind: string) => { request.kind = kind; return q },
        or: (filter: string) => { request.filter = filter; return q },
        is: () => { request.general = true; return q },
        order: () => q,
        range: async (from: number) => {
          request.from = from
          fake.requests.push(request)
          if (fake.fail) return { data: null, error: new Error('Database unavailable') }
          const length = fake.paged && from === 0 ? 1000 : 1
          return { data: Array.from({ length }, (_, i) => ({ id: `${table}-${from + i}` })), error: null }
        },
      }
      return q
    },
  }),
}))
vi.mock('@workspace/db', () => ({ pool: {} }))
vi.mock('@/lib/patients/outreach', () => ({ ensurePrimaryServices: vi.fn() }))
vi.mock('@/lib/patients/outreach-policy', () => ({ planOutreach: vi.fn() }))
vi.mock('@/lib/patients/queue-read', () => ({ readQueuePatients: vi.fn(), isQueueReserve: vi.fn() }))

import { getScriptFlow } from './reactivation'
import { clearScriptFlowCache } from './script-flow-cache'

const a = '00000000-0000-0000-0000-000000000001'
const b = '00000000-0000-0000-0000-000000000002'
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  clearScriptFlowCache()
  fake.requests.length = 0
  fake.fail = false
  fake.paged = false
})
afterEach(() => { clearScriptFlowCache(); vi.useRealTimers() })

it('requests only authorized niches and shared defaults for both script tables', async () => {
  await getScriptFlow('reactivation', [a])
  expect(fake.requests).toHaveLength(2)
  for (const r of fake.requests) {
    expect(r.kind).toBe('reactivation')
    expect(r.filter).toBe(`niche_id.is.null,niche_id.in.(${a})`)
    expect(r.general).toBeUndefined()
  }
})

it('defaults to general-only, never an unrestricted collection', async () => {
  await getScriptFlow()
  expect(fake.requests).toHaveLength(2)
  expect(fake.requests.every((r) => r.general && !r.filter)).toBe(true)
})

it('shares simultaneous and repeated loads even when niche order differs', async () => {
  const [one, two] = await Promise.all([
    getScriptFlow('reactivation', [a, b, a]),
    getScriptFlow('reactivation', [b, a]),
  ])
  expect(one).toBe(two)
  await getScriptFlow('reactivation', [b, a])
  expect(fake.requests).toHaveLength(2)
})

it('never shares cache data between different account niche sets or flow families', async () => {
  await getScriptFlow('reactivation', [a])
  await getScriptFlow('reactivation', [b])
  await getScriptFlow('lead', [a])
  expect(fake.requests).toHaveLength(6)
  expect(fake.requests.map((r) => [r.kind, r.filter])).toEqual([
    ['reactivation', `niche_id.is.null,niche_id.in.(${a})`],
    ['reactivation', `niche_id.is.null,niche_id.in.(${a})`],
    ['reactivation', `niche_id.is.null,niche_id.in.(${b})`],
    ['reactivation', `niche_id.is.null,niche_id.in.(${b})`],
    ['lead', `niche_id.is.null,niche_id.in.(${a})`],
    ['lead', `niche_id.is.null,niche_id.in.(${a})`],
  ])
})

it('refreshes within one minute so external script edits are not cached indefinitely', async () => {
  await getScriptFlow('reactivation', [a])
  vi.advanceTimersByTime(60_000)
  await getScriptFlow('reactivation', [a])
  expect(fake.requests).toHaveLength(4)
})

it('does not cache failed loads or silently return an empty flow', async () => {
  fake.fail = true
  await expect(getScriptFlow('reactivation', [a])).rejects.toThrow('Database unavailable')
  fake.fail = false
  const flow = await getScriptFlow('reactivation', [a])
  expect(flow.steps).toHaveLength(1)
  expect(flow.choices).toHaveLength(1)
  expect(fake.requests).toHaveLength(4)
})

it('keeps pagination so large permitted script collections are not truncated', async () => {
  fake.paged = true
  const flow = await getScriptFlow('reactivation', [a])
  expect(flow.steps).toHaveLength(1001)
  expect(flow.choices).toHaveLength(1001)
  expect(fake.requests.filter((r) => r.from === 1000)).toHaveLength(2)
})

it('rejects invalid filter values before contacting Supabase', async () => {
  await expect(getScriptFlow('lead', ['invalid),niche_id.not.is.null'])).rejects.toThrow('Invalid script niche ID')
  expect(fake.requests).toHaveLength(0)
})
