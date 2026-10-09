import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { EnrollmentNotifications } from './enrollment-notifications'

const mocked = vi.hoisted(() => ({
  list: vi.fn(), claim: vi.fn(), read: vi.fn(), prefs: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
}))
vi.mock('@/app/actions/enrollment-notifications', () => ({
  listNotifications: mocked.list, claimDelivery: mocked.claim, markRead: mocked.read, savePreferences: mocked.prefs,
}))
vi.mock('sonner', () => ({ toast: mocked.toast }))
// Browser test covers real Radix focus/keyboard; keep these delivery tests small.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => children,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}))

const event = {
  id: '101', agreementId: 'agreement-fixture', customerName: 'Alex', practiceName: 'Example Practice',
  milestone: 'signed' as const, occurredAt: '2026-10-09T10:00:00Z', read: false,
  href: '/admin/agreements/agreement-fixture',
}
function response(overrides = {}) {
  return { items: [event], live: [], cursor: '101', unread: 1,
    preferences: { sound: false, desktop: false }, hasMore: false, ...overrides }
}
const desktop = vi.fn()
const requestPermission = vi.fn()
const audioCreated = vi.fn()
const oscillatorStarted = vi.fn()
const audioClosed = vi.fn()
class FakeNotification {
  static permission = 'default'
  static requestPermission = requestPermission
  onclick: any
  onclose: any
  constructor(title: string, options: any) { desktop(title, options) }
  close() {}
}
class FakeAudioContext {
  state = 'running'
  currentTime = 0
  destination = {}
  constructor() { audioCreated() }
  async resume() {}
  async close() { audioClosed() }
  createOscillator() {
    return { type: '', frequency: { value: 0 }, connect: (x: any) => x, start: oscillatorStarted, stop: vi.fn() }
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({}) }
  }
}
async function load() {
  render(<EnrollmentNotifications adminUserId="fixture-admin" />)
  await act(async () => {})
}
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(5000) }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  localStorage.clear()
  FakeNotification.permission = 'default'
  vi.stubGlobal('Notification', FakeNotification)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  mocked.list.mockResolvedValue(response())
  mocked.claim.mockResolvedValue({ claimed: true })
  mocked.read.mockResolvedValue({ ok: true })
  mocked.prefs.mockResolvedValue({ ok: true })
  requestPermission.mockImplementation(async () => { FakeNotification.permission = 'granted'; return 'granted' })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('enrollment notification delivery controls', () => {
  it('does not replay initial history or request permission/audio even with saved preferences on', async () => {
    FakeNotification.permission = 'granted'
    mocked.list.mockResolvedValue(response({ preferences: { sound: true, desktop: true } }))
    await load()
    expect(screen.getByText('Unlock sound')).toBeTruthy()
    expect(mocked.toast).not.toHaveBeenCalled()
    expect(mocked.claim).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(audioCreated).not.toHaveBeenCalled()
    expect(desktop).not.toHaveBeenCalled()
  })

  it('handles denied and unsupported desktop permission without requesting on load', async () => {
    requestPermission.mockImplementation(async () => { FakeNotification.permission = 'denied'; return 'denied' })
    await load()
    expect(requestPermission).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByTestId('button-toggle-desktop')) })
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(screen.getByTestId('text-desktop-status').textContent).toMatch(/blocked/i)
    expect(mocked.prefs).not.toHaveBeenCalled()
    cleanup()
    vi.stubGlobal('Notification', undefined)
    await load()
    expect(screen.getByTestId('text-desktop-status').textContent).toMatch(/not supported/i)
  })

  it('enables desktop only explicitly, emits privacy-safe text, and obeys delivery claims', async () => {
    await load()
    await act(async () => { fireEvent.click(screen.getByTestId('button-toggle-desktop')) })
    expect(mocked.prefs).toHaveBeenCalledWith({ desktop: true })
    mocked.list.mockResolvedValue(response({ live: [{ ...event, id: '102' }], cursor: '102',
      preferences: { sound: false, desktop: true } }))
    await poll()
    expect(mocked.claim).toHaveBeenCalledWith('102')
    expect(desktop).toHaveBeenCalledOnce()
    expect(desktop.mock.calls[0][0]).toBe('Patient Pipeline — Enrollment update')
    expect(JSON.stringify(desktop.mock.calls)).not.toMatch(/Alex|Example Practice|4242|token/)
    expect(mocked.toast).toHaveBeenCalledWith(expect.stringContaining('signed the agreement'),
      expect.objectContaining({ action: expect.objectContaining({ label: 'View' }) }))
    mocked.claim.mockResolvedValue({ claimed: false })
    mocked.list.mockResolvedValue(response({ live: [{ ...event, id: '103' }], cursor: '103',
      preferences: { sound: false, desktop: true } }))
    await poll()
    expect(desktop).toHaveBeenCalledOnce()
  })

  it('allows disabling the saved desktop preference even on a denied device', async () => {
    FakeNotification.permission = 'denied'
    mocked.list.mockResolvedValue(response({ preferences: { sound: false, desktop: true } }))
    await load()
    await act(async () => { fireEvent.click(screen.getByTestId('button-toggle-desktop')) })
    expect(mocked.prefs).toHaveBeenCalledWith({ desktop: false })
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('unlocks audio only after a click, respects mute, and stops polling on expiry', async () => {
    await load()
    await act(async () => { fireEvent.click(screen.getByTestId('button-toggle-sound')) })
    expect(audioCreated).toHaveBeenCalledOnce()
    expect(mocked.prefs).toHaveBeenCalledWith({ sound: true })
    expect(oscillatorStarted).toHaveBeenCalledOnce() // short enabling preview
    mocked.list.mockResolvedValue(response({ live: [{ ...event, id: '102' }], cursor: '102',
      preferences: { sound: true, desktop: false } }))
    await poll()
    expect(oscillatorStarted).toHaveBeenCalledTimes(2)
    await act(async () => { fireEvent.click(screen.getByTestId('button-toggle-sound')) })
    expect(mocked.prefs).toHaveBeenLastCalledWith({ sound: false })
    mocked.list.mockResolvedValue(response({ live: [{ ...event, id: '103' }], cursor: '103' }))
    await poll()
    expect(oscillatorStarted).toHaveBeenCalledTimes(2)
    await act(async () => { window.dispatchEvent(new Event('session-expired')) })
    const calls = mocked.list.mock.calls.length
    await poll()
    expect(mocked.list).toHaveBeenCalledTimes(calls)
    expect(audioClosed).toHaveBeenCalledOnce()
  })

  it('preserves its incremental cursor after a transient error and reconciles reads', async () => {
    await load()
    mocked.list.mockRejectedValueOnce(new Error('offline'))
    await poll()
    mocked.list.mockResolvedValue(response({ items: [{ ...event, read: true }], unread: 0 }))
    await poll()
    expect(mocked.list).toHaveBeenLastCalledWith({ after: '101' })
    expect(screen.queryByTestId('button-read-101')).toBeNull()
    mocked.list.mockRejectedValueOnce(new ApiError('Unauthorized', 401))
    await poll()
    const calls = mocked.list.mock.calls.length
    await poll()
    expect(mocked.list).toHaveBeenCalledTimes(calls)
  })
})
