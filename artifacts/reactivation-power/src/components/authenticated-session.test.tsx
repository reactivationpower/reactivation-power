import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthenticatedSession } from './authenticated-session'

let fetchMock: ReturnType<typeof vi.fn>
const IDLE = 30 * 60_000
const state = (deadline = Date.now() + IDLE) => new Response(JSON.stringify({
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
  it('keeps a server-verified demo visible beyond 30 idle minutes, with no warning, and on tab return', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      sessionId: 'demo-session', deadline: Date.now() + 30 * 86400_000,
      serverNow: Date.now(), inactivityExempt: true,
    }), { headers: { 'content-type': 'application/json' } }))
    render(<AuthenticatedSession kind="portal"><div>Demo content</div></AuthenticatedSession>)
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(31 * 60_000) })
    expect(screen.queryByRole('alertdialog')).toBeNull()
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

describe('"Still there?" warning before the 30-minute inactivity logout', () => {
  const sessionPosts = () => fetchMock.mock.calls.filter(([url, init]) =>
    String(url).includes('/session/portal') && init?.method === 'POST')
  async function openWarning() {
    render(<AuthenticatedSession kind="portal"><div>Private content</div></AuthenticatedSession>)
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE - 61_000) })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    return screen.getByRole('alertdialog', { name: 'Still there?' })
  }
  it('appears 1 minute before logout with a live countdown and focus on the button', async () => {
    const dialog = await openWarning()
    expect(dialog.textContent).toMatch(/signed out in 59 seconds/)
    const button = screen.getByRole('button', { name: 'Stay signed in' })
    expect(document.activeElement).toBe(button)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(dialog.textContent).toMatch(/signed out in 49 seconds/)
    expect(screen.getByText('Private content')).toBeTruthy()
    // Showing the warning is not activity.
    expect(sessionPosts()).toHaveLength(0)
  })
  it('"Stay signed in" sends real activity right away and resets the 30 minutes', async () => {
    await openWarning()
    fetchMock.mockImplementation(async () => state())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' })) })
    await settle()
    expect(sessionPosts()).toHaveLength(1)
    const [, init] = sessionPosts()[0]!
    expect((init.headers as Record<string, string>)['X-Session-Id']).toBe('one-session')
    expect(JSON.parse(init.body as string).interactionAgeMs).toBeLessThan(1000)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // The fresh deadline is 30 minutes away: no warning until 29 minutes from now.
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE - 62_000) })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Private content')).toBeTruthy()
  })
  it('closes in this tab when another tab stays signed in', async () => {
    await openWarning()
    act(() => {
      localStorage.setItem('patient-pipeline-session:portal:one-session', JSON.stringify({
        sessionId: 'one-session', deadline: Date.now() + IDLE,
      }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'patient-pipeline-session:portal:one-session' }))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(sessionPosts()).toHaveLength(0)
  })
  it('ignores another session\'s update and rechecks with the server at the deadline if nobody clicks', async () => {
    await openWarning()
    act(() => {
      localStorage.setItem('patient-pipeline-session:portal:other-session', JSON.stringify({
        sessionId: 'other-session', deadline: Date.now() + IDLE,
      }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'patient-pipeline-session:portal:other-session' }))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    const before = fetchMock.mock.calls.length
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetchMock.mock.calls.length).toBe(before + 1)
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/session/portal')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByText('Private content')).toBeNull()
    expect(sessionPosts()).toHaveLength(0)
  })
})
