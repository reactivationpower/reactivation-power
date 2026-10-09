import { expect, it, vi } from 'vitest'
import type { Response } from 'express'
vi.mock('@workspace/db', async () => ({
  ...await import('../../../../lib/db/src/capacity'),
  pool: { totalCount: 2, idleCount: 0, waitingCount: 1 },
}))
vi.mock('./logger', () => ({ logger: { warn: vi.fn() } }))
import { respondDatabaseUnavailable } from './database-unavailable'
it('sanitizes wrapped errors into no-store 503 responses without replaying work', () => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  expect(respondDatabaseUnavailable({ cause: { code: '53300', message: 'private SQL and connection details' } }, res as unknown as Response)).toBe(true)
  expect(res.status).toHaveBeenCalledWith(503)
  expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5')
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private')
  expect(respondDatabaseUnavailable(new Error('business validation'), res as unknown as Response)).toBe(false)
})
