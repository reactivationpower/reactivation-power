import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  downloadOnboardingW9, getAdminOnboarding, isStaleError, resendOnboardingInvitation, reviewOnboarding, revealOnboardingWire,
  type FullWire, type Onboarding,
} from '@/app/actions/affiliate-onboarding'

export interface OnboardingPanelApi {
  get: (id: string) => Promise<Onboarding>
  review: (id: string, version: number) => Promise<unknown>
  reveal: (id: string, version: number) => Promise<FullWire>
  w9: (id: string, version: number) => Promise<{ base64: string; filename: string }>
  resend?: (id: string) => Promise<{ ok: boolean; error?: string }>
}
const affiliateApi: OnboardingPanelApi = {
  get: getAdminOnboarding,
  review: (affiliateId, version) => reviewOnboarding({ affiliateId, version }),
  reveal: (affiliateId, version) => revealOnboardingWire({ affiliateId, version }),
  w9: (affiliateId, version) => downloadOnboardingW9({ affiliateId, version }),
  resend: resendOnboardingInvitation,
}
import { Section, btn2Cls, btnCls, fmtDate } from './shared'

const REVEAL_MS = 60_000
const INVITE_LABEL: Record<string, string> = { pending: 'Queued', sending: 'Sending', accepted: 'Provider accepted', cancelled: 'Cancelled', failed: 'Failed', uncertain: 'Uncertain, check log' }

function addr(a: unknown) {
  if (!a || typeof a !== 'object') return '-'
  const x = a as Record<string, string>
  return [x.line1, x.line2, [x.city, x.state, x.zip].filter(Boolean).join(' '), x.country].filter(Boolean).join(', ')
}

export function AdminOnboardingPanel({ affiliateId, api = affiliateApi }: { affiliateId: string; api?: OnboardingPanelApi }) {
  const [d, setD] = useState<Onboarding | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [wire, setWire] = useState<FullWire | null>(null)
  const [busy, setBusy] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef(affiliateId)
  current.current = affiliateId

  const hide = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setWire(null) }, [])

  const load = useCallback(async () => {
    const forId = affiliateId
    setState('loading'); setErr('')
    try { const r = await api.get(forId); if (current.current === forId) { setD(r); setState('ready') } }
    catch (e) { if (current.current === forId) { setErr((e as Error).message); setState('error') } }
  }, [affiliateId])

  // Reset everything sensitive on profile change and on unmount.
  useEffect(() => {
    current.current = affiliateId; setD(null); hide(); void load()
    return () => { current.current = ''; hide() }
  }, [affiliateId, load, hide])
  useEffect(() => {
    const refresh = () => { hide(); void load() }
    window.addEventListener('focus', refresh); window.addEventListener('pagehide', hide)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pagehide', hide) }
  }, [load, hide])

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try { await fn() } catch (e) {
      if (isStaleError(e)) { toast.error('Onboarding changed since loaded. Reloaded latest.'); hide(); await load() }
      else toast.error((e as Error).message)
    } finally { setBusy('') }
  }

  const reveal = () => run('reveal', async () => {
    if (!d) return
    const forId = affiliateId
    const w = await api.reveal(forId, d.version)
    if (current.current !== forId) return
    setWire(w)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setWire(null); timer.current = null }, REVEAL_MS)
  })

  const download = () => run('w9', async () => {
    if (!d) return
    const r = await api.w9(affiliateId, d.version)
    const bin = atob(r.base64); const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a'); a.href = url; a.download = r.filename || 'signed-w9.pdf'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })

  const review = () => run('review', async () => {
    if (!d) return
    await api.review(affiliateId, d.version); toast.success('Marked reviewed'); hide(); await load()
  })

  const resend = () => run('resend', async () => {
    if (!api.resend) return
    const r = await api.resend(affiliateId)
    if (r.ok === false) throw new Error(r.error ?? 'Resend failed')
    toast.success('Onboarding invitation queued'); await load()
  })

  return (
    <Section title="Payment onboarding" desc="Contact, wire and W-9 submitted by the partner. Transfers are still sent externally each month. Review confirms you looked it over; it is not bank verification or IRS validation.">
      {state === 'loading' ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : state === 'error' || !d ? (
        <div className="space-y-2"><p className="text-sm text-destructive" role="alert">{err || 'Unable to load onboarding'}</p><button className={btn2Cls} onClick={() => void load()} data-testid="button-onboarding-retry">Retry</button></div>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="status-admin-onboarding" className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.status === 'reviewed' ? 'bg-success/15 text-success' : d.status === 'submitted' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{d.status}</span>
            <span className="text-xs text-muted-foreground">v{d.version}{d.submittedAt ? ` | received ${fmtDate(d.submittedAt)}` : ''}{d.reviewedAt ? ` | reviewed ${fmtDate(d.reviewedAt)}` : ''}</span>
          </div>

          {d.contact ? (
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2" data-testid="card-onboarding-contact">
              <div><dt className="text-xs text-muted-foreground">Contact</dt><dd>{d.contact.contactName}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{d.contact.phone}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Legal payee</dt><dd>{d.contact.legalName}</dd></div>
              <div><dt className="text-xs text-muted-foreground">DBA</dt><dd>{d.contact.dba || '-'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Mailing address</dt><dd>{addr(d.contact.address)}</dd></div>
            </dl>
          ) : <p className="text-muted-foreground">No contact details submitted yet.</p>}

          <div className="rounded-lg border border-border p-3">
            {d.bank ? (
              <>
                <p className="font-medium" data-testid="text-bank-summary">{d.bank.bankName} | {d.bank.accountHolder} | {d.bank.accountType} | ending <span className="font-mono">{d.bank.last4}</span></p>
                {wire ? (
                  <div className="mt-3 space-y-1 rounded-md bg-muted/60 p-3" data-testid="card-wire-revealed">
                    <p>Routing (wire ABA): <span className="font-mono">{String(wire.routingNumber ?? '')}</span></p>
                    <p>Account: <span className="font-mono">{String(wire.accountNumber ?? '')}</span></p>
                    <p>Bank address: {addr(wire.bankAddress)}</p>
                    {wire.instructions ? <p>Instructions: {String(wire.instructions)}</p> : null}
                    <p className="text-xs text-muted-foreground">Hidden automatically after 60 seconds. Reveal is audited.</p>
                    <button className={btn2Cls} onClick={hide} data-testid="button-hide-wire">Hide now</button>
                  </div>
                ) : <button className={btn2Cls + ' mt-3'} disabled={busy === 'reveal'} onClick={() => void reveal()} data-testid="button-reveal-wire">{busy === 'reveal' ? 'Revealing...' : 'Reveal full wire details'}</button>}
              </>
            ) : <p className="text-muted-foreground">No bank details on file.</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={btn2Cls} disabled={!d.w9Received || busy === 'w9'} onClick={() => void download()} data-testid="button-download-w9">{d.w9Received ? (busy === 'w9' ? 'Downloading...' : 'Download signed W-9') : 'No W-9 on file'}</button>
            <button className={btnCls} disabled={d.status !== 'submitted' || busy === 'review'} onClick={() => void review()} data-testid="button-review-onboarding">{busy === 'review' ? 'Saving...' : 'Mark reviewed'}</button>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Invitations</p>
              {api.resend ? <button className={btn2Cls} disabled={busy === 'resend'} onClick={() => void resend()} data-testid="button-resend-onboarding">{busy === 'resend' ? 'Queueing...' : 'Resend invitation'}</button> : null}
            </div>
            {d.invitations?.length ? (
              <ul className="mt-2 divide-y divide-border">
                {d.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2" data-testid={`row-invitation-${i.id}`}>
                    <span>{INVITE_LABEL[i.status] ?? i.status}{i.delivery_status ? <span className="text-muted-foreground"> | email {i.delivery_status.replace(/_/g, ' ')}</span> : null}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(i.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-muted-foreground">No onboarding invitations yet.</p>}
          </div>
        </div>
      )}
    </Section>
  )
}
