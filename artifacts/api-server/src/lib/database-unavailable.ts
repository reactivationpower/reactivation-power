import type { Response } from 'express'
import { isDatabaseUnavailable, DATABASE_UNAVAILABLE_MESSAGE, pool } from '@workspace/db'
import { logger } from './logger'

export function respondDatabaseUnavailable(error: unknown, res: Response): boolean {
  if (!isDatabaseUnavailable(error)) return false
  logger.warn({ event: 'database_unavailable', total: pool.totalCount,
    idle: pool.idleCount, waiting: pool.waitingCount }, 'database capacity or connection unavailable')
  res.setHeader('Retry-After', '5')
  res.setHeader('Cache-Control', 'no-store')
  res.status(503).json({ ok: false, code: 'DATABASE_UNAVAILABLE', error: DATABASE_UNAVAILABLE_MESSAGE })
  return true
}
