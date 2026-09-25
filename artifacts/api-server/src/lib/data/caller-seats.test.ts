import { beforeEach, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const mock = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn() }))
vi.mock('@workspace/db', () => ({ db: { transaction: mock.transaction } }))
import { changeCallerSeat } from './caller-seats'
const dialect = new PgDialect()
const add = { kind: 'add' as const, firstName: 'A', lastName: 'B', email: 'a@example.com', phone: null }
beforeEach(() => {
  vi.clearAllMocks()
  mock.transaction.mockImplementation(fn => fn({ execute: mock.execute }))
})
it('holds the owner transaction lock before counting and inserting', async () => {
  mock.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 4 }] }).mockResolvedValueOnce({ rows: [{ id: 'new' }] })
  expect(await changeCallerSeat('owner', add)).toEqual({ id: 'new' })
  const queries = mock.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q))
  expect(queries[0].sql).toContain('pg_advisory_xact_lock')
  expect(queries[0].params).toEqual(['caller-seats:owner'])
  expect(queries[1].sql).toContain('count(*)')
  expect(queries[2].sql).toContain('insert into participants')
  expect(mock.transaction).toHaveBeenCalledTimes(1)
})
it('takes the SAME lock before scoped reactivation/count/write', async () => {
  mock.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'staff', is_active: false }] })
    .mockResolvedValueOnce({ rows: [{ count: 4 }] }).mockResolvedValueOnce({ rows: [] })
  await changeCallerSeat('owner', { kind: 'active', memberId: 'staff', active: true })
  const queries = mock.execute.mock.calls.map(([q]) => dialect.sqlToQuery(q))
  expect(queries[0].params).toEqual(['caller-seats:owner'])
  expect(queries[1].params).toEqual(['staff', 'owner'])
  expect(queries[1].sql).toContain('for update')
  expect(queries[2].sql).toContain('count(*)')
  expect(queries[3].sql).toContain('update participants')
})
it('refuses the next seat when the serialized count is five', async () => {
  mock.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 5 }] })
  expect(await changeCallerSeat('owner', add)).toEqual({ error: 'You can have up to 5 active callers.' })
  expect(mock.execute).toHaveBeenCalledTimes(2)
})
it('does not let a foreign caller be reactivated', async () => {
  mock.execute.mockResolvedValue({ rows: [] })
  expect(await changeCallerSeat('owner', { kind: 'active', memberId: 'foreign', active: true })).toEqual({ error: 'Caller not found.' })
  expect(mock.execute).toHaveBeenCalledTimes(2)
})
it('treats activating an already active caller as idempotent even at cap', async () => {
  mock.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ is_active: true }] })
  expect(await changeCallerSeat('owner', { kind: 'active', memberId: 'staff', active: true })).toEqual({ id: 'staff' })
  expect(mock.execute).toHaveBeenCalledTimes(2)
})
it('fails closed on database errors', async () => {
  mock.execute.mockRejectedValue(new Error('db unavailable'))
  expect(await changeCallerSeat('owner', add)).toHaveProperty('error')
  expect(mock.execute).toHaveBeenCalledTimes(1)
})