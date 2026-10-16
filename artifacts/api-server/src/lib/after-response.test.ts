import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Work that continues after a response: on Vercel it must be handed to the
 * platform's waitUntil (or the frozen function drops it); elsewhere it runs on
 * as background work. Either way a failure is logged, never thrown into the
 * request that started it.
 */

const waitUntil = vi.fn((_p: Promise<unknown>) => undefined)
vi.mock('@vercel/functions', () => ({ waitUntil }))
const warn = vi.fn()
vi.mock('./logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }))

const { runAfterResponse } = await import('./after-response')

afterEach(() => vi.clearAllMocks())

describe('runAfterResponse', () => {
  it('registers the work with waitUntil and resolves when it settles', async () => {
    let done = false
    const promise = runAfterResponse('test', async () => { await new Promise((r) => setTimeout(r, 5)); done = true })
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(waitUntil.mock.calls[0]?.[0]).toBe(promise)
    await promise
    expect(done).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('swallows and logs a rejection or a synchronous throw', async () => {
    await expect(runAfterResponse('boom', async () => { throw new Error('later') })).resolves.toBeUndefined()
    await expect(runAfterResponse('boom-sync', () => { throw new Error('now') })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('still runs the work when waitUntil is unavailable (Replit)', async () => {
    waitUntil.mockImplementationOnce(() => { throw new Error('no request context') })
    let ran = false
    await runAfterResponse('plain', async () => { ran = true })
    expect(ran).toBe(true)
  })
})
