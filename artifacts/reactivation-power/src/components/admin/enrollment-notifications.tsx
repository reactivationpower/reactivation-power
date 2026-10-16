import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Check, Loader2, Monitor, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ApiError, safeRedirect } from '@/lib/api'
import {
  claimDelivery, listNotifications, markRead, savePreferences,
  type EnrollmentNotification, type Milestone, type NotificationPrefs,
} from '@/app/actions/enrollment-notifications'

const POLL_MS = 5000
const PREVIEW_TITLE = 'Patient Pipeline — Enrollment update'

function describe(n: EnrollmentNotification): string {
  const who = `${n.customerName || 'a contact'}${n.practiceName ? ` at ${n.practiceName}` : ''}`
  const m: Record<Milestone, string> = {
    opened: `Agreement for ${who} was opened via the shared link. This does not confirm anyone read it.`,
    signed: `${who} signed the agreement.`,
    primary_card: `${who} saved the primary card.`,
    backup_card: `${who} saved the backup card.`,
    completed: `Enrollment for ${who} is complete.`,
  }
  return m[n.milestone]
}
function short(n: EnrollmentNotification): string {
  const who = `${n.customerName || 'a contact'}${n.practiceName ? ` at ${n.practiceName}` : ''}`
  return n.milestone === 'opened' ? `Agreement for ${who} was opened` : describe(n)
}
function safeGet(k: string) { try { return localStorage.getItem(k) } catch { return null } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); return true } catch { return false } }
function go(href: string) { window.location.assign(safeRedirect(href)) }
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}
function isStop(e: unknown) {
  if (e instanceof ApiError) return e.status === 401 || /session.?expired|logged.?out|logout/i.test(e.message)
  return false
}

export function EnrollmentNotifications({ adminUserId }: { adminUserId: string }) {
  const [items, setItems] = useState<EnrollmentNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [prefs, setPrefs] = useState<NotificationPrefs>({ sound: false, desktop: false })
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(false)
  const [paging, setPaging] = useState(false)
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [desktopBlocked, setDesktopBlocked] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const audio = useRef<AudioContext | null>(null)
  const prefsRef = useRef(prefs); prefsRef.current = prefs
  const unlockedRef = useRef(unlocked); unlockedRef.current = unlocked
  const cursor = useRef<string | undefined>(undefined)
  const oldest = useRef<string | undefined>(undefined)
  const stopped = useRef(false)
  const gen = useRef(0)
  const toasted = useRef(new Set<string>())
  const active = useRef(new Set<Notification>())
  const reloadRef = useRef<() => void>(() => {})

  const shutdown = useCallback(() => {
    stopped.current = true
    toasted.current.forEach(id => toast.dismiss(`enrollment:${adminUserId}:${id}`))
    active.current.forEach((n) => { try { n.close() } catch { /* ignore */ } })
    active.current.clear()
    const ctx = audio.current; audio.current = null
    if (ctx) void ctx.close().catch(() => {})
    unlockedRef.current = false
    setUnlocked(false)
  }, [adminUserId])

  const ding = useCallback(() => {
    const ctx = audio.current
    if (!ctx) return
    try {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4)
    } catch { /* ignore */ }
  }, [])

  const unlock = useCallback(async () => {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return false
    try {
      if (!audio.current) audio.current = new AC()
      await audio.current!.resume()
      if (audio.current?.state !== 'running') return false
    } catch { return false }
    setUnlocked(true); unlockedRef.current = true
    return true
  }, [])

  const deliver = useCallback(async (n: EnrollmentNotification, g: number, latestPrefs?: NotificationPrefs) => {
    const live = () => !stopped.current && gen.current === g
    const p = latestPrefs ?? prefsRef.current
    const soundOk = p.sound && unlockedRef.current
    const deskOk = p.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted'
    let claimed = true
    if (soundOk || deskOk) {
      try { claimed = (await claimDelivery(n.id)).claimed } catch (e) {
        if (isStop(e)) { shutdown(); return }
        // Keep the incremental cursor unchanged so a transient delivery-claim
        // failure is retried; already claimed events remain duplicate-safe.
        throw e
      }
      if (!live()) return
    }
    const key = `pp-enroll-toast:${adminUserId}:${n.id}`
    const show = () => {
      if (!live() || toasted.current.has(n.id)) return
      if (safeGet(key)) { toasted.current.add(n.id); return }
      toasted.current.add(n.id)
      safeSet(key, String(Date.now()))
      toast(short(n), {
        id: `enrollment:${adminUserId}:${n.id}`,
        toasterId: 'admin-enrollment',
        description: n.milestone === 'opened' ? 'Opened through the shared link.' : undefined,
        action: { label: 'View', onClick: () => go(n.href) },
        duration: 9000,
        className: 'border-l-4 border-l-primary',
      })
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(key, show)
      else show()
    } catch { show() }
    if (!live() || !claimed) return
    if (soundOk) ding()
    if (deskOk) {
      try {
        const nt = new Notification(PREVIEW_TITLE, { body: 'Open the dashboard to see details.', tag: n.id })
        active.current.add(nt)
        nt.onclose = () => active.current.delete(nt)
        nt.onclick = () => { window.focus(); go(n.href); nt.close() }
      } catch { if (live()) setDesktopBlocked(true) }
    }
  }, [adminUserId, ding, shutdown])
  const deliverRef = useRef(deliver); deliverRef.current = deliver

  useEffect(() => {
    const g = ++gen.current
    stopped.current = false
    cursor.current = undefined; oldest.current = undefined
    toasted.current = new Set()
    setItems([]); setUnread(0); setHasMore(false); setLoading(true); setLoadErr(false)
    const current = () => gen.current === g && !stopped.current
    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight = false

    const onExpired = () => { shutdown(); if (timer) clearTimeout(timer) }
    window.addEventListener('session-expired', onExpired)

    const schedule = () => { if (current()) timer = setTimeout(tick, POLL_MS) }
    const tick = async () => {
      if (!current() || inFlight) return
      if (cursor.current === undefined) { schedule(); return }
      inFlight = true
      try {
        const r = await listNotifications({ after: cursor.current })
        if (!current()) return
        setUnread(r.unread); setPrefs(r.preferences)
        const fresh = new Map(r.items.map((i) => [i.id, i]))
        const live = r.live.slice(0, 50)
        setItems((cur) => {
          const ids = new Set(cur.map((i) => i.id))
          const added = live.filter((l) => !ids.has(l.id)).reverse()
          return [...added, ...cur.map((i) => { const f = fresh.get(i.id); return f ? { ...i, read: f.read } : i })]
        })
        for (const n of live) { if (!current()) return; await deliverRef.current(n, g, r.preferences) }
        if (!current()) return
        cursor.current = r.cursor
      } catch (e) {
        if (isStop(e)) { shutdown(); return }
      } finally { inFlight = false }
      schedule()
    }

    ;(async () => {
      try {
        const r = await listNotifications({})
        if (!current()) return
        setItems(r.items); setUnread(r.unread); setPrefs(r.preferences); setHasMore(r.hasMore)
        cursor.current = r.cursor
        oldest.current = r.items[r.items.length - 1]?.id
        setLoadErr(false)
      } catch (e) {
        if (!current()) return
        if (isStop(e)) { shutdown(); return }
        setLoadErr(true)
      } finally { if (gen.current === g) setLoading(false) }
      if (timer) clearTimeout(timer)
      schedule()
    })()
    reloadRef.current = () => { if (current()) { setLoading(true); setLoadErr(false); void (async () => {
      try {
        const r = await listNotifications({})
        if (!current()) return
        setItems(r.items); setUnread(r.unread); setPrefs(r.preferences); setHasMore(r.hasMore)
        cursor.current = r.cursor; oldest.current = r.items[r.items.length - 1]?.id
        if (timer) clearTimeout(timer)
        schedule()
      } catch (e) { if (current()) { if (isStop(e)) shutdown(); else setLoadErr(true) } }
      finally { if (gen.current === g) setLoading(false) }
    })() } }

    return () => {
      window.removeEventListener('session-expired', onExpired)
      if (timer) clearTimeout(timer)
      gen.current++
      shutdown()
    }
  }, [adminUserId, shutdown])

  const more = async () => {
    const g = gen.current
    setPaging(true)
    try {
      const r = await listNotifications({ before: oldest.current })
      if (gen.current !== g || stopped.current) return
      setItems((cur) => {
        const ids = new Set(cur.map((i) => i.id))
        return [...cur, ...r.items.filter((i) => !ids.has(i.id))]
      })
      setHasMore(r.hasMore)
      oldest.current = r.items[r.items.length - 1]?.id ?? oldest.current
    } catch (e) {
      if (isStop(e)) shutdown()
      else toast.error('Could not load older notifications.')
    } finally { setPaging(false) }
  }

  const read = async (n: EnrollmentNotification) => {
    if (n.read || busy) return
    const g = gen.current
    setBusy(n.id)
    try {
      await markRead(n.id)
      if (gen.current !== g || stopped.current) return
      setItems((c) => c.map((i) => (i.id === n.id ? { ...i, read: true } : i)))
      setUnread((u) => Math.max(0, u - 1))
    } catch (e) {
      if (isStop(e)) shutdown(); else toast.error('Could not mark this notification as read. Try again.')
    } finally { setBusy(null) }
  }
  const markAll = async () => {
    const g = gen.current
    setBusy('all')
    try {
      await markRead()
      if (gen.current !== g || stopped.current) return
      setItems((c) => c.map((i) => ({ ...i, read: true }))); setUnread(0)
    } catch (e) {
      if (isStop(e)) shutdown(); else toast.error('Could not mark all as read. Try again.')
    } finally { setBusy(null) }
  }

  const setSound = async (on: boolean) => {
    if (on && !(await unlock())) { toast.error('This browser blocked audio.'); return }
    try {
      await savePreferences({ sound: on })
      if (stopped.current) return
      setPrefs((p) => ({ ...p, sound: on }))
      if (on) ding()
    } catch (e) {
      if (isStop(e)) shutdown(); else toast.error('Could not save sound setting. Try again.')
    }
  }
  const setDesktop = async (on: boolean) => {
    try {
      if (on) {
        if (typeof Notification === 'undefined') return
        const res = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
        setPerm(res)
        if (res !== 'granted') return
        setDesktopBlocked(false)
      }
      await savePreferences({ desktop: on })
      if (stopped.current) return
      setPrefs((p) => ({ ...p, desktop: on }))
    } catch (e) {
      if (isStop(e)) shutdown(); else toast.error('Could not save desktop setting. Try again.')
    }
  }

  const soundOn = prefs.sound
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-enrollment-notifications"
          aria-label={unread > 0 ? `Enrollment notifications, ${unread} unread` : 'Enrollment notifications'}
          className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span data-testid="badge-unread-count" className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0 motion-reduce:animate-none" data-testid="panel-enrollment-notifications">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Enrollment activity</h2>
          <Button size="sm" variant="ghost" disabled={unread === 0 || busy !== null} onClick={markAll} data-testid="button-mark-all-read">
            <Check className="mr-1 size-3.5" aria-hidden /> Mark all read
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto" role="list" aria-live="polite">
          {loading ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted motion-reduce:animate-none" />)}
            </div>
          ) : loadErr ? (
            <div className="p-6 text-center text-sm">
              <p className="text-muted-foreground">Could not load notifications.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => reloadRef.current()} data-testid="button-retry-notifications">Retry</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <BellOff className="size-6" aria-hidden />
              <p>No enrollment activity yet. Agreement views, signatures and card steps will appear here.</p>
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                role="listitem"
                data-testid={`item-notification-${n.id}`}
                className="flex items-start gap-2 border-b border-border px-2 py-1 transition-colors hover:bg-muted focus-within:bg-muted"
              >
                <button
                  type="button"
                  data-testid={`link-notification-${n.id}`}
                  onClick={() => { void read(n); setOpen(false); go(n.href) }}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-primary'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{describe(n)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {n.read ? '' : 'Unread · '}
                      <time dateTime={n.occurredAt} title={new Date(n.occurredAt).toLocaleString()}>{ago(n.occurredAt)}</time>
                    </span>
                  </span>
                </button>
                {!n.read && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    data-testid={`button-read-${n.id}`}
                    aria-label="Mark as read"
                    onClick={() => void read(n)}
                    className="mt-2 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >{busy === n.id ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="size-4" aria-hidden />}</button>
                )}
              </div>
            ))
          )}
          {hasMore && !loading && (
            <div className="p-3 text-center">
              <Button size="sm" variant="outline" onClick={more} disabled={paging} data-testid="button-load-older">
                {paging && <Loader2 className="mr-1 size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />} Load older
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-border bg-muted/40 px-4 py-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              {soundOn && !unlocked ? 'Sound is on for your account but needs a tap on this device.' : soundOn ? 'Sound is on.' : 'Sound is muted.'}
            </span>
            <Button size="sm" variant="outline" onClick={() => setSound(soundOn && unlocked ? false : true)} data-testid="button-toggle-sound" aria-pressed={soundOn && unlocked}>
              {soundOn && unlocked ? <><VolumeX className="mr-1 size-3.5" aria-hidden />Mute</> : <><Volume2 className="mr-1 size-3.5" aria-hidden />{soundOn ? 'Unlock sound' : 'Enable sound'}</>}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground" data-testid="text-desktop-status">
              {desktopBlocked ? 'Desktop alerts are blocked here; bell history still works.'
                : perm === 'unsupported' ? 'Desktop notifications are not supported in this browser.'
                : perm === 'denied' ? 'Desktop notifications are blocked. Allow them in your browser site settings.'
                : prefs.desktop && perm === 'granted' ? 'Desktop notifications are on.'
                : 'Desktop notifications are off.'}
            </span>
            <Button size="sm" variant="outline" disabled={!prefs.desktop && (perm === 'unsupported' || perm === 'denied')}
              aria-pressed={prefs.desktop}
              onClick={() => setDesktop(!prefs.desktop)} data-testid="button-toggle-desktop">
              <Monitor className="mr-1 size-3.5" aria-hidden />
              {prefs.desktop ? 'Turn off' : 'Enable desktop notifications'}
            </Button>
          </div>
          <p className="text-muted-foreground">Alerts work only while this dashboard is open in a browser tab. They will not arrive after the browser is closed.</p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
