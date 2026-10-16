import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { connect: vi.fn(async () => mocks) } }))
import { authTransaction } from './portal-challenges'
it('uses and releases the checked-out connection and discards a broken rollback without masking the cause', async () => {
  mocks.query.mockResolvedValue({})
  await expect(authTransaction(async client => { await client.query('SELECT 1'); return 7 })).resolves.toBe(7)
  expect(mocks.release).toHaveBeenLastCalledWith(false)
  const original = Object.assign(new Error('capacity'), { code: '53300' })
  mocks.query.mockImplementation(async (sql: string) => { if (sql === 'ROLLBACK') throw new Error('socket gone'); return {} })
  await expect(authTransaction(async () => { throw original })).rejects.toBe(original)
  expect(mocks.release).toHaveBeenLastCalledWith(true)
})
