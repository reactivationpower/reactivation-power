import { beforeEach, expect, it, vi } from 'vitest'
import type { PoolClient, Pool } from 'pg'
import {
  configureDatabaseReadTracking, takeDatabaseReadReport, trackDatabaseClient,
  trackDatabasePool, flushDatabaseReadTracking,
} from '../../../../lib/db/src/read-tracking'

beforeEach(() => {
  takeDatabaseReadReport()
  configureDatabaseReadTracking(() => {}, () => 'test-fixture')
})

it('counts UTF-8 result bytes without retaining SQL, parameters or patient data', async () => {
  const rows = [{ name: 'PRIVATE PATIENT é', phone: 'SECRET PHONE' }]
  const result = { rows }
  const query = vi.fn().mockResolvedValue(result)
  const client = { query } as unknown as PoolClient
  trackDatabaseClient(client)
  trackDatabaseClient(client)
  expect(await client.query("SELECT * FROM contacts WHERE token='SECRET TOKEN'", ['SECRET PARAM'])).toBe(result)
  expect(query).toHaveBeenCalledOnce()
  const report = takeDatabaseReadReport()!
  expect(report.estimatedResultBytes).toBe(Buffer.byteLength(JSON.stringify(rows)))
  expect(report.returnedRows).toBe(1)
  expect(report.calls).toBe(1)
  expect(report.topQueries[0]?.operation).toBe('SELECT')
  const logged = JSON.stringify(report)
  for (const secret of ['PRIVATE PATIENT', 'SECRET PHONE', 'SECRET TOKEN', 'SECRET PARAM', 'SELECT *']) {
    expect(logged).not.toContain(secret)
  }
  expect(takeDatabaseReadReport()).toBeNull()
})

it('preserves callback behavior and aggregates repeated reads', () => {
  const result = { rows: [[1, 'row']] }
  const query = vi.fn((_text, _values, cb) => { cb(null, result); return undefined })
  const client = { query } as unknown as PoolClient
  trackDatabaseClient(client)
  const callback = vi.fn()
  for (let n = 0; n < 2; n++) expect(client.query('SELECT value', [], callback)).toBeUndefined()
  expect(callback).toHaveBeenNthCalledWith(1, null, result)
  const report = takeDatabaseReadReport()!
  expect(report.calls).toBe(2)
  expect(report.returnedRows).toBe(2)
  expect(report.estimatedResultBytes).toBe(2 * Buffer.byteLength(JSON.stringify(result.rows)))
})

it('preserves rejection identity and never logs error messages', async () => {
  const error = new Error('SECRET ERROR')
  const client = { query: vi.fn().mockRejectedValue(error) } as unknown as PoolClient
  trackDatabaseClient(client)
  await expect(client.query('SELECT broken')).rejects.toBe(error)
  const report = takeDatabaseReadReport()!
  expect(report.failures).toBe(1)
  expect(report.estimatedResultBytes).toBe(0)
  expect(JSON.stringify(report)).not.toContain('SECRET ERROR')
})

it('counts multi-statement results, then flushes once to the configured sink', async () => {
  const client = { query: vi.fn().mockResolvedValue([{ rows: [{ a: 1 }] }, { rows: [{ a: 2 }] }]) } as unknown as PoolClient
  trackDatabaseClient(client)
  await client.query('SELECT 1; SELECT 2')
  const sink = vi.fn()
  configureDatabaseReadTracking(sink)
  flushDatabaseReadTracking()
  flushDatabaseReadTracking()
  expect(sink).toHaveBeenCalledOnce()
  expect(sink.mock.calls[0]![0].returnedRows).toBe(2)
})

it('leaves custom query objects unchanged and attaches once per pool', () => {
  const returned = { on: vi.fn() }
  const client = { query: vi.fn().mockReturnValue(returned) } as unknown as PoolClient
  const original = client.query
  trackDatabaseClient(client)
  const custom = { submit: vi.fn() }
  expect(Reflect.apply(client.query, client, [custom])).toBe(returned)
  expect(original).toHaveBeenCalledWith(custom)
  expect(takeDatabaseReadReport()).toBeNull()
  const pool = { on: vi.fn(), query: vi.fn() } as unknown as Pool
  trackDatabasePool(pool)
  trackDatabasePool(pool)
  expect(pool.on).toHaveBeenCalledOnce()
})

it('keeps the pool caller location across asynchronous connection acquisition', async () => {
  const client = { query: vi.fn().mockResolvedValue({ rows: [{ count: 3 }] }) } as unknown as PoolClient
  trackDatabaseClient(client)
  const query = vi.fn(async () => {
    await new Promise(resolve => setImmediate(resolve))
    return client.query('SELECT count')
  })
  const pool = { on: vi.fn(), query } as unknown as Pool
  trackDatabasePool(pool)
  await pool.query('SELECT count')
  const report = takeDatabaseReadReport()!
  expect(report.calls).toBe(1)
  expect(report.topQueries[0]?.source).toContain('database-read-tracking.test.ts:')
})

it('keeps bounded groups, preserves overflow totals, and ranks the largest reads first', async () => {
  const client = { query: vi.fn().mockResolvedValue({ rows: [{ value: 'x'.repeat(100) }] }) } as unknown as PoolClient
  trackDatabaseClient(client)
  for (let i = 0; i < 600; i++) await client.query(`SELECT ${i}`)
  const report = takeDatabaseReadReport()!
  expect(report.calls).toBe(600)
  expect(report.returnedRows).toBe(600)
  expect(report.estimatedResultBytes).toBe(600 * Buffer.byteLength(JSON.stringify([{ value: 'x'.repeat(100) }])))
  expect(report.topQueries).toHaveLength(20)
  expect(report.topQueries[0]?.queryId).toBe('overflow')
})

it('lazy mode flushes from the next query after the window ends instead of a timer (Vercel)', async () => {
  const reports: unknown[] = []
  configureDatabaseReadTracking((r) => reports.push(r), () => 'test-fixture', { flush: 'lazy' })
  const client = { query: vi.fn().mockResolvedValue({ rows: [{ a: 1 }] }) } as unknown as PoolClient
  trackDatabaseClient(client)
  vi.useFakeTimers()
  try {
    await client.query('SELECT 1')
    vi.advanceTimersByTime(10 * 60_000)
    // No timer fired: nothing was reported while the process was "frozen".
    expect(reports).toHaveLength(0)
    await client.query('SELECT 2')
    expect(reports).toHaveLength(1)
  } finally {
    vi.useRealTimers()
    configureDatabaseReadTracking(() => {}, () => 'test-fixture')
  }
})
