import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAction, onBackForwardRestore } from './api'

function pageShow(persisted: boolean) {
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { value: persisted })
  window.dispatchEvent(event)
}

// Same-document hash target: jsdom can follow it without a real navigation.
function stubRedirect() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    status: 200,
    json: async () => ({ ok: true, result: null, redirect: '/#booked' }),
  })))
}

describe('redirecting actions and the back/forward cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('stays pending while navigating, then settles with the previous form state when the page is restored', async () => {
    stubRedirect()
    const prev = { values: { firstName: 'Test' } }
    const data = new FormData()
    data.set('firstName', 'Test')
    let settled: unknown = 'pending'
    const call = callAction('leads', 'submitHealthcareLead', [prev, data]).then((r) => { settled = r })
    await vi.waitFor(() => expect(window.location.hash).toBe('#booked'))
    pageShow(false) // a normal page show is not a Back restore
    await Promise.resolve()
    expect(settled).toBe('pending')
    pageShow(true)
    await call
    expect(settled).toBe(prev)
  })

  it('settles empty for actions that are not (prevState, formData) form actions', async () => {
    stubRedirect()
    const call = callAction('demo', 'switchDemoView', ['id-fixture'])
    await vi.waitFor(() => expect(window.location.hash).toBe('#booked'))
    pageShow(true)
    await expect(call).resolves.toBeUndefined()
  })

  it('notifies restore listeners only for back/forward restores, until cleaned up', () => {
    const restore = vi.fn()
    const stop = onBackForwardRestore(restore)
    pageShow(false)
    expect(restore).not.toHaveBeenCalled()
    pageShow(true)
    expect(restore).toHaveBeenCalledTimes(1)
    stop()
    pageShow(true)
    expect(restore).toHaveBeenCalledTimes(1)
  })
})
