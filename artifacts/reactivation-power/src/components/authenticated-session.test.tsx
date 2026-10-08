import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthenticatedSession } from './authenticated-session'

let fetchMock: ReturnType<typeof vi.fn>
const state = (deadline = Date.now() + 300_000) => new Response(JSON.stringify({
  sessionId: 'one-session', deadline, serverNow: Date.now(),
}), { headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  fetchMock = vi.fn(async () => state())
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('authenticated content visibility and human-only activity', () => {
  it('keeps a server-verified demo visible beyond five idle minutes and on tab return', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      sessionId: 'demo-session', deadline: Date.now() + 30 * 86400_000,
      serverNow: Date.now(), inactivityExempt: true,
    }), { headers: { 'content-type': 'application/json' } }))
    render(<AuthenticatedSession kind="portal"><div>Demo content</div></AuthenticatedSession>)
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000) })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
      window.dispatchEvent(new Event('pageshow'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.getByText('Demo content')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not render protected children until the server validates the session', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(r => { resolve = r }))
    render(<AuthenticatedSession kind="portal"><div>Private content</div></AuthenticatedSession>)
    expect(screen.queryByText('Private content')).toBeNull()
    await act(async () => resolve(state()))
    expect(screen.getByText('Private content')).toBeTruthy()
  })
  it('does not display protected content from a status response delayed past its deadline', async () => {
    const oldResponse = state(Date.now() + 2000)
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(r => { resolve = r }))
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}))
    render(<AuthenticatedSession kind="portal"><div>Private content</div></AuthenticatedSession>)
    await act(async () => { vi.advanceTimersByTime(3000); resolve(oldResponse) })
    await settle()
    expect(screen.queryByText('Private content')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('background requests and script-generated events never send human activity', async () => {
    render(<AuthenticatedSession kind="portal"><div>Private content</div></AuthenticatedSession>)
    await settle()
    await act(async () => {
      window.dispatchEvent(new Event('pointermove'))
      window.dispatchEvent(new Event('keydown'))
      window.dispatchEvent(new Event('scroll'))
      await window.fetch('/api/progress', { method: 'POST' })
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).includes('/session/') && init?.method === 'POST')).toBe(false)
  })
  it('masks private content on pagehide and waits for revalidation on return', async () => {
    render(<AuthenticatedSession kind="admin"><div>Private admin content</div></AuthenticatedSession>)
    await settle()
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(screen.queryByText('Private admin content')).toBeNull()
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(r => { resolve = r }))
    act(() => window.dispatchEvent(new Event('pageshow')))
    expect(screen.queryByText('Private admin content')).toBeNull()
    await act(async () => resolve(state()))
    expect(screen.getByText('Private admin content')).toBeTruthy()
  })
  it('tab coordination stays scoped to the exact session, not the account', async () => {
    render(<AuthenticatedSession kind="portal"><div>Private content</div></AuthenticatedSession>)
    await settle()
    act(() => {
      localStorage.setItem('patient-pipeline-session:portal:other-session', JSON.stringify({
        sessionId: 'other-session', revoked: true, deadline: Date.now(),
      }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'patient-pipeline-session:portal:other-session' }))
    })
    expect(screen.getByText('Private content')).toBeTruthy()
  })
})
