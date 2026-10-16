import { useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { apiUrl } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { clearManagedUploads } from '@/lib/upload-manager'
import { Button } from '@/components/ui/button'

type Kind = 'portal' | 'admin'
type State = { sessionId: string; deadline: number; serverNow: number; inactivityExempt?: boolean }
type Shared = { sessionId: string; deadline: number; revoked?: boolean; inactivity?: boolean }
const PREFIX = 'patient-pipeline-session:'
const THROTTLE_MS = 10_000
/** "Still there?" appears this long before the inactivity logout. */
export const WARNING_MS = 60_000

/** Mount before protected children, including on browser Back / BFCache restore. */
export function AuthenticatedSession({ kind, children }: { kind: Kind; children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  /** Whole seconds left while the "Still there?" warning shows; null when hidden. */
  const [warning, setWarning] = useState<number | null>(null)
  const staySignedIn = useRef<() => void>(() => {})
  useEffect(() => {
    const originalFetch = window.fetch
    const request = originalFetch.bind(window)
    let state: Shared | null = null
    let disposed = false
    let ended = false
    let checking = false
    let lastSent = 0
    let lastHuman = 0
    let sentHuman = 0
    let inactivityExempt = false
    let activityTimer: ReturnType<typeof setTimeout> | undefined
    let shownWarning: number | null = null
    const controller = new AbortController()
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${PREFIX}${kind}`) : null
    const url = apiUrl(`/session/${kind}`)
    const storageKey = () => `${PREFIX}${kind}:${state?.sessionId}`
    let login = kind === 'admin' ? '/admin-login' : '/login'
    const showWarning = (seconds: number | null) => {
      if (disposed || seconds === shownWarning) return
      shownWarning = seconds
      setWarning(seconds)
    }
    /** Follows the shared deadline, so staying signed in from any tab closes it everywhere. */
    const updateWarning = () => {
      if (!state || ended || inactivityExempt) { showWarning(null); return }
      const left = state.deadline - Date.now()
      showWarning(left > 0 && left <= WARNING_MS ? Math.ceil(left / 1000) : null)
    }
    const hide = () => {
      if (!disposed) flushSync(() => setVisible(false))
    }
    const publish = (value: Shared) => {
      try { localStorage.setItem(storageKey(), JSON.stringify(value)) } catch { /* storage may be disabled */ }
      channel?.postMessage(value)
    }
    const sharedState = () => {
      if (!state) return
      try {
        const value = JSON.parse(localStorage.getItem(storageKey()) ?? 'null') as Shared | null
        if (value?.sessionId === state.sessionId && Number.isFinite(value.deadline)) {
          if (value.revoked) { finish(value.inactivity ?? true); return }
          state.deadline = Math.max(state.deadline, value.deadline)
        }
      } catch { /* the server remains authoritative */ }
    }
    function finish(inactivity = true) {
      if (ended || disposed) return
      ended = true
      showWarning(null)
      hide()
      controller.abort()
      void queryClient.cancelQueries()
      queryClient.clear()
      clearManagedUploads()
      if (activityTimer) clearTimeout(activityTimer)
      if (state) {
        publish({ ...state, revoked: true, inactivity })
        // Navigation must not depend on a working network. The server also
        // rejects idle cookies, and expected-id prevents logging out a new login.
        void request(url, {
          method: 'DELETE', credentials: 'include', keepalive: true,
          headers: { 'X-Session-Id': state.sessionId },
        }).catch(() => {})
      }
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const params = new URLSearchParams()
      if (inactivity) params.set('reason', 'inactivity')
      if (state) params.set('session', state.sessionId)
      window.location.replace(`${base}${login}${params.size ? '?' + params : ''}`)
    }
    const accept = (body: State, requestedAt: number) => {
      if (ended || disposed) return false
      sharedState()
      if (ended) return false
      if (!body.sessionId || !Number.isFinite(body.deadline) || !Number.isFinite(body.serverNow)) {
        finish(); return false
      }
      // A response received after sleep is not a fresh 30-minute allowance.
      // Translate relative to request start, conservatively including transit
      // and suspension time rather than relative to response receipt.
      const deadline = requestedAt + body.deadline - body.serverNow
      inactivityExempt = kind === 'portal' && body.inactivityExempt === true
      login = kind === 'admin' ? '/admin-login' : inactivityExempt ? '/demo' : '/login'
      state = { sessionId: body.sessionId, deadline: state?.sessionId === body.sessionId ? Math.max(state.deadline, deadline) : deadline }
      publish(state)
      updateWarning()
      return Date.now() < state.deadline
    }
    async function check() {
      if (checking || ended || disposed) return
      checking = true
      const timeout = setTimeout(() => {
        if (!ended && !disposed) finish()
      }, 8000)
      const requestedAt = Date.now()
      try {
        const response = await request(url, { credentials: 'include', cache: 'no-store', signal: controller.signal })
        if (!response.ok) { finish(); return }
        if (!accept(await response.json(), requestedAt)) {
          if (!ended && !disposed) queueMicrotask(() => void check())
          return
        }
        if (!ended && !disposed && document.visibilityState !== 'hidden') setVisible(true)
      } catch {
        if (!ended && !disposed) finish()
      } finally {
        clearTimeout(timeout)
        checking = false
        if (!ended && !disposed && lastHuman > sentHuman) void sendActivity()
      }
    }
    async function sendActivity() {
      activityTimer = undefined
      if (!state || ended || disposed || checking || lastHuman <= sentHuman) return
      sharedState()
      if (ended) return
      // Human input after the deadline is not a way back into the session.
      if (Date.now() >= state.deadline) { hide(); void check(); return }
      lastSent = Date.now()
      const requestedAt = lastSent
      const human = lastHuman
      sentHuman = human
      try {
        const response = await request(url, {
          method: 'POST', credentials: 'include', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': state.sessionId },
          body: JSON.stringify({ interactionAgeMs: Math.max(0, Date.now() - human) }),
        })
        if (response.status === 401) { finish(); return }
        if (response.ok && !accept(await response.json(), requestedAt)) {
          hide(); void check()
        }
      } catch { /* never extend the acknowledged deadline on network failure */ }
    }
    const interact = (event: Event) => {
      if (inactivityExempt) return
      if (!event.isTrusted || !state || ended || disposed || document.visibilityState === 'hidden') return
      // Browsers also emit trusted scroll events for script-driven scrolling.
      if (event.type === 'scroll' && Date.now() - lastHuman > 1000) return
      sharedState()
      if (ended) return
      if (Date.now() >= state.deadline) { hide(); void check(); return }
      lastHuman = Date.now()
      if (!activityTimer) {
        const delay = Math.max(0, THROTTLE_MS - (Date.now() - lastSent))
        activityTimer = setTimeout(() => void sendActivity(), delay)
      }
    }
    // The "Stay signed in" button is real activity: send it now, not after the throttle.
    staySignedIn.current = () => {
      if (!state || ended || disposed || inactivityExempt) return
      lastHuman = Date.now()
      if (activityTimer) clearTimeout(activityTimer)
      activityTimer = undefined
      void sendActivity()
    }
    const resume = () => {
      if (inactivityExempt) return
      hide()
      if (document.visibilityState !== 'hidden') void check()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey()) sharedState()
    }
    if (channel) channel.onmessage = (event: MessageEvent<Shared>) => {
      const value = event.data
      if (!state || value?.sessionId !== state.sessionId) return
      if (value.revoked) finish(value.inactivity ?? true)
      else if (Number.isFinite(value.deadline)) {
        state.deadline = Math.max(state.deadline, value.deadline)
        updateWarning()
      }
    }
    const onExpiredResponse = () => finish()
    const onPageHide = () => { if (!inactivityExempt) hide() }
    // Covers raw upload/progress/polling callers as well as the RPC client.
    window.fetch = async (...args) => {
      if (ended) throw new Error('Session ended')
      const supplied = args[1]?.signal ?? (args[0] instanceof Request ? args[0].signal : null)
      let signal = controller.signal
      if (supplied) {
        if (typeof AbortSignal.any === 'function') signal = AbortSignal.any([controller.signal, supplied])
        else {
          const combined = new AbortController()
          if (supplied.aborted || controller.signal.aborted) combined.abort()
          else {
            supplied.addEventListener('abort', () => combined.abort(), { once: true })
            controller.signal.addEventListener('abort', () => combined.abort(), { once: true })
          }
          signal = combined.signal
        }
      }
      const response = await request(args[0], { ...args[1], signal })
      const target = args[0] instanceof Request ? args[0].url : String(args[0])
      const targetUrl = new URL(target, window.location.href)
      const apiBase = new URL(apiUrl('/'), window.location.href)
      if (targetUrl.origin === apiBase.origin && targetUrl.pathname.startsWith(apiBase.pathname)) {
        if (response.status === 401) finish()
        if (response.headers.get('content-type')?.includes('application/json')) {
          const body = await response.clone().json().catch(() => null)
          if (typeof body?.redirect === 'string' && /^\/(?:admin-login|login)(?:\?|$)/.test(body.redirect)) {
            finish(body.redirect.includes('reason=inactivity'))
          }
        }
      }
      return response
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'touchmove', 'scroll', 'wheel']
    events.forEach(e => window.addEventListener(e, interact, { passive: true, capture: true }))
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', resume)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('focus', resume)
    window.addEventListener('session-expired', onExpiredResponse)
    document.addEventListener('visibilitychange', resume)
    const tick = setInterval(() => {
      if (!state || ended) return
      sharedState()
      if (ended) return
      updateWarning()
      if (Date.now() >= state.deadline) { hide(); void check() }
    }, 250)
    void check()
    return () => {
      disposed = true
      staySignedIn.current = () => {}
      controller.abort()
      channel?.close()
      clearInterval(tick)
      if (activityTimer) clearTimeout(activityTimer)
      window.fetch = originalFetch
      events.forEach(e => window.removeEventListener(e, interact, true))
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('focus', resume)
      window.removeEventListener('session-expired', onExpiredResponse)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [kind])
  if (!visible) return <div role="status" className="p-6 text-sm text-muted-foreground">Checking your session…</div>
  return (
    <>
      {children}
      {warning !== null && <StillThereDialog seconds={warning} onStay={() => staySignedIn.current()} />}
    </>
  )
}

function StillThereDialog({ seconds, onStay }: { seconds: number; onStay: () => void }) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    button.current?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="still-there-title"
        aria-describedby="still-there-text"
        onKeyDown={event => {
          if (event.key === 'Escape') onStay()
          // Keep keyboard focus inside the box.
          if (event.key === 'Tab') { event.preventDefault(); button.current?.focus() }
        }}
        className="w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-lg">
        <h2 id="still-there-title" className="text-lg font-semibold">Still there?</h2>
        <p id="still-there-text" className="mt-2 text-sm text-muted-foreground">
          For your security, you will be signed out in{' '}
          <span className="font-semibold text-foreground" aria-live="off">
            {seconds} second{seconds === 1 ? '' : 's'}
          </span>{' '}
          because there has been no activity.
        </p>
        <Button ref={button} type="button" className="mt-5 w-full" onClick={onStay}>Stay signed in</Button>
      </div>
    </div>
  )
}
