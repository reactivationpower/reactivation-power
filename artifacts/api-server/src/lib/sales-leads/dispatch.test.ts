import { describe, it, expect, vi, afterEach } from 'vitest'
const mocks = vi.hoisted(() => ({ drain: vi.fn() }))
vi.mock('./worker', () => ({ drainSalesSync: mocks.drain }))
import { nudgeSalesSync } from './dispatch'

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('post-commit dispatcher', () => {
  it('begins promptly and preserves nudges arriving while draining', async () => {
    let release!: (value: boolean) => void
    mocks.drain.mockImplementationOnce(() => new Promise<boolean>(r => { release = r })).mockResolvedValue(false)
    const start = performance.now()
    nudgeSalesSync()
    await vi.waitFor(() => expect(mocks.drain).toHaveBeenCalledTimes(1))
    expect(performance.now() - start).toBeLessThan(2000)
    nudgeSalesSync(); nudgeSalesSync()
    release(false)
    await vi.waitFor(() => expect(mocks.drain).toHaveBeenCalledTimes(2))
  })
  it('continues bounded full batches without needing another mutation', async () => {
    mocks.drain.mockResolvedValueOnce(true).mockResolvedValue(false)
    nudgeSalesSync()
    await vi.waitFor(() => expect(mocks.drain).toHaveBeenCalledTimes(2))
  })
  it('a database outage does not spin or reject the committed save', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.drain.mockRejectedValueOnce(new Error('not logged')).mockResolvedValue(false)
    nudgeSalesSync()
    await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1))
    expect(mocks.drain).toHaveBeenCalledTimes(1)
    nudgeSalesSync()
    await vi.waitFor(() => expect(mocks.drain).toHaveBeenCalledTimes(2))
    warning.mockRestore()
  })
})
