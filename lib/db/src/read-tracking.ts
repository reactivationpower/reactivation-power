import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Pool, PoolClient } from 'pg'

/**
 * Counts serialized result bytes, NOT billed wire bytes. No SQL, parameters,
 * row contents, URLs, or errors are retained. No extra database queries.
 */
const WINDOW_MS = 5 * 60_000
const MAX_GROUPS = 512
const clients = new WeakSet<PoolClient>()
const pools = new WeakSet<Pool>()
const callsite = new AsyncLocalStorage<{ source: string; context: string }>()
type Entry = {
  queryId: string; source: string; operation: string; context: string
  calls: number; returnedRows: number; estimatedResultBytes: number; failures: number
}
const entries = new Map<string, Entry>()
let startedAt = Date.now()
let timer: NodeJS.Timeout | undefined
let contextProvider = () => 'background-or-test'
let reportSink = (report: DatabaseReadReport) => {
  process.stderr.write(`${JSON.stringify(report)}\n`)
}

export interface DatabaseReadReport {
  event: 'database_read_usage'
  measurement: 'serialized_result_estimate_not_billed_egress'
  environment: string
  processId: number
  windowStartedAt: string
  windowEndedAt: string
  calls: number
  returnedRows: number
  estimatedResultBytes: number
  failures: number
  topQueries: Entry[]
}

export function configureDatabaseReadTracking(
  sink: (report: DatabaseReadReport) => void,
  context?: () => string,
) {
  reportSink = sink
  if (context) contextProvider = context
}

function sourceFromStack() {
  // Source-mapped app callsite or test filename, never an absolute home path.
  const frames = new Error().stack?.split('\n') ?? []
  for (const frame of frames) {
    if (frame.includes('node_modules') || frame.includes('/lib/db/')) continue
    const match = frame.match(/\/((?:artifacts|scripts|lib)\/[A-Za-z0-9_./-]+:\d+:\d+)/)
    if (match) return match[1]!
  }
  return 'unknown-callsite'
}

function identify(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const word = normalized.match(/^(SELECT|WITH|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|DROP|SET|ANALYZE)\b/i)?.[1]
  return {
    queryId: createHash('sha256').update(normalized).digest('hex').slice(0, 16),
    operation: word?.toUpperCase() ?? 'OTHER',
    ...(callsite.getStore() ?? { source: sourceFromStack(), context: contextProvider() }),
  }
}

function record(identity: ReturnType<typeof identify>, result: unknown, failed: boolean) {
  // Tracking must never change a successful query or conceal its real error.
  try {
    let bytes = 0, rows = 0
    for (const value of Array.isArray(result) ? result : [result]) {
      const returned = (value as { rows?: unknown[] } | undefined)?.rows
      if (returned?.length) {
        rows += returned.length
        bytes += Buffer.byteLength(JSON.stringify(returned))
      }
    }
    let key = JSON.stringify(identity)
    let info = identity
    if (!entries.has(key) && entries.size >= MAX_GROUPS) {
      key = 'overflow'
      info = { queryId: 'overflow', source: 'other-query-groups', operation: 'OTHER', context: 'mixed' }
    }
    const entry = entries.get(key) ?? { ...info, calls: 0, returnedRows: 0, estimatedResultBytes: 0, failures: 0 }
    entry.calls++
    entry.returnedRows += rows
    entry.estimatedResultBytes += bytes
    entry.failures += Number(failed)
    entries.set(key, entry)
    if (!timer) {
      timer = setInterval(flushDatabaseReadTracking, WINDOW_MS)
      timer.unref()
    }
  } catch {
    // Never print the offending result/SQL/error: it can contain patient data.
  }
}

export function takeDatabaseReadReport(): DatabaseReadReport | null {
  const now = Date.now()
  const all = [...entries.values()]
  const report: DatabaseReadReport | null = all.length ? {
    event: 'database_read_usage',
    measurement: 'serialized_result_estimate_not_billed_egress',
    environment: process.env.NODE_ENV === 'test' ? 'test' : process.env.NODE_ENV === 'production' ? 'production' : 'development',
    processId: process.pid,
    windowStartedAt: new Date(startedAt).toISOString(),
    windowEndedAt: new Date(now).toISOString(),
    calls: all.reduce((n, x) => n + x.calls, 0),
    returnedRows: all.reduce((n, x) => n + x.returnedRows, 0),
    estimatedResultBytes: all.reduce((n, x) => n + x.estimatedResultBytes, 0),
    failures: all.reduce((n, x) => n + x.failures, 0),
    topQueries: all.sort((a, b) => b.estimatedResultBytes - a.estimatedResultBytes || b.calls - a.calls).slice(0, 20),
  } : null
  entries.clear()
  startedAt = now
  return report
}

export function flushDatabaseReadTracking() {
  const report = takeDatabaseReadReport()
  if (report) {
    try { reportSink(report) } catch { /* Diagnostics cannot break database work. */ }
  }
}

/** Preserve pg's promise, callback and custom-query return conventions. */
export function trackDatabaseClient(client: PoolClient) {
  if (clients.has(client)) return
  clients.add(client)
  const original = client.query
  client.query = function (this: PoolClient, ...args: unknown[]) {
    const first = args[0]
    // Custom query/stream objects own their execution; do not alter them.
    if (first && typeof first === 'object' && 'submit' in first) {
      return Reflect.apply(original, this, args)
    }
    const text = typeof first === 'string' ? first : (first as { text?: string } | undefined)?.text
    if (!text) return Reflect.apply(original, this, args)
    const identity = identify(text)
    const last = args.length - 1
    if (typeof args[last] === 'function') {
      const callback = args[last] as (...values: unknown[]) => unknown
      args[last] = function (this: unknown, error: unknown, result: unknown) {
        record(identity, result, Boolean(error))
        return callback.call(this, error, result)
      }
      return Reflect.apply(original, this, args)
    }
    const pending = Reflect.apply(original, this, args)
    if (pending && typeof pending.then === 'function') {
      return pending.then((result: unknown) => {
        record(identity, result, false)
        return result
      }, (error: unknown) => {
        record(identity, undefined, true)
        throw error
      })
    }
    return pending
  } as PoolClient['query']
}

export function trackDatabasePool(pool: Pool) {
  if (pools.has(pool)) return
  pools.add(pool)
  pool.on('connect', trackDatabaseClient)
  // pool.query can acquire a connection asynchronously. Capture its caller
  // before pg's internal callback loses the application's original stack.
  const original = pool.query
  pool.query = function (this: Pool, ...args: unknown[]) {
    return callsite.run(
      { source: sourceFromStack(), context: contextProvider() },
      () => Reflect.apply(original, this, args),
    )
  } as Pool['query']
}
