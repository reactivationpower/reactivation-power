import { useState, type ReactNode } from 'react'
import { Field, Section, Stat, StatusPill, Table, btn2Cls, btnCls, fmtDate, inputCls, money } from '@/components/affiliates/shared'
import type { Report } from '@/app/actions/resellers'

export function RForm({ onSubmit, children, submit, testid, tone }: { onSubmit: () => Promise<unknown>; children: ReactNode; submit: string; testid: string; tone?: 'danger' }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await onSubmit() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
      {children}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <button className={tone === 'danger' ? 'inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50' : btnCls} disabled={busy} data-testid={testid}>{busy ? 'Saving...' : submit}</button>
    </form>
  )
}

export function TF(p: { l: string; v: string; set: (s: string) => void; t?: string; h?: string; id: string; req?: boolean; ph?: string }) {
  return <Field label={p.l} hint={p.h}><input data-testid={p.id} type={p.t ?? 'text'} placeholder={p.ph} required={p.req !== false} className={inputCls} value={p.v} onChange={(e) => p.set(e.target.value)} /></Field>
}

export function QueryError({ error, onRetry, busy }: { error: unknown; onRetry: () => void; busy?: boolean }) {
  return <div className="space-y-2" role="alert"><p className="text-sm text-destructive">{(error as Error)?.message ?? 'Unable to load'}</p><button className={btn2Cls} disabled={busy} onClick={onRetry}>{busy ? 'Retrying...' : 'Retry'}</button></div>
}

export function Skeleton({ n = 3 }: { n?: number }) {
  return <div className="space-y-3">{Array.from({ length: n }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />)}</div>
}

/** The email-link or fallback-link outcome of an invitation action. */
export function inviteLink(r: unknown): string {
  if (!r || typeof r !== 'object') return ''
  const o = r as Record<string, unknown>
  for (const k of ['url', 'inviteUrl', 'inviteLink', 'link', 'fallbackUrl']) if (typeof o[k] === 'string') return o[k] as string
  const found = Object.values(o).find((v) => typeof v === 'string' && /^https?:\/\//.test(v))
  return (found as string) ?? ''
}
export function inviteEmailed(r: unknown): boolean | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  for (const k of ['emailed', 'emailSent', 'sent', 'ok']) if (typeof o[k] === 'boolean') return o[k] as boolean
  return null
}

export function InviteResult({ result }: { result: unknown }) {
  if (!result) return null
  const link = inviteLink(result); const emailed = inviteEmailed(result)
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm" data-testid="invite-result">
      <p>{emailed === false ? 'The email could not be delivered. Share this link directly.' : emailed ? 'Invitation emailed. Backup link below.' : 'Invitation created.'}</p>
      {link && <input readOnly onFocus={(e) => e.currentTarget.select()} className={inputCls + ' font-mono text-xs'} value={link} data-testid="text-invite-link" />}
    </div>
  )
}

export const STAGES = ['New', 'Contacted', 'Demo', 'Offer', 'Customer', 'Do Not Contact', 'Lost'] as const

export function Finance({ report, payoutAction, title = 'Earnings and payments' }: { report: Report; payoutAction?: (payout: any) => ReactNode; title?: string }) {
  const ob = report.onboarding_status
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Earned" value={money(report.earned_cents)} />
        <Stat label="Paid" value={money(report.paid_cents)} />
        <Stat label="Balance" value={money(report.balance_cents)} tone={report.balance_cents < 0 ? 'neg' : undefined} sub="Earned minus paid" />
        <Stat label="Eligible collected" value={money(report.collected_cents)} sub="Lifetime / recurring; excludes setup" />
        <Stat label="Reversals" value={money(report.reversals_cents)} tone={report.reversals_cents ? 'neg' : undefined} sub="Refund and clawback adjustments" />
      </div>
      <Section title={title} desc={`Payment details status: ${ob ?? 'unknown'}. Wires are sent outside this system and recorded here.`}>
        <div className="space-y-6">
          <Table empty="No periods yet. Earnings appear after the first collected payment."
            head={['Period', 'Earned', 'Paid', 'Available to wire']}
            rows={report.periods.map((p) => [p.period, money(p.earned_cents), money(p.paid_cents), money(p.wireable_cents)])} />
          <Table empty="No wires recorded yet."
            head={['Date', 'Period', 'Amount', 'Reference', ...(payoutAction ? [''] : [])]}
            rows={report.payouts.map((p: any) => [p.payment_date ? String(p.payment_date).slice(0, 10) : fmtDate(p.created_at ?? ''), p.period ?? '-', money(Number(p.amount_cents)), <span className="font-mono text-xs">{p.reference ?? '-'}</span>, ...(payoutAction ? [payoutAction(p)] : [])])} />
        </div>
      </Section>
      <Section title="Sales" desc="Customers sold and where each enrollment stands.">
        <Table empty="No sales yet."
          head={['Customer', 'Business', 'Type', 'Salesperson', 'Subscription', 'Agreement', 'Completed']}
          rows={report.sales.map((s: any) => [s.customer_name ?? '-', s.business_name ?? '-', s.type === 'one_time' ? 'Lifetime' : s.type === 'subscription' ? 'Monthly' : (s.type ?? '-'), s.salesperson_name ?? '-', s.subscription_status ? <StatusPill s={s.subscription_status} /> : '-', s.agreement_status ? <StatusPill s={s.agreement_status} /> : '-', s.completed_at ? fmtDate(s.completed_at) : 'In progress'])} />
      </Section>
      <Section title="Ledger" desc="Every earning, reversal and owner correction. Signed amounts.">
        <Table empty="Ledger is empty."
          head={['When', 'Period', 'Kind', 'Amount', 'Reason']}
          rows={report.entries.map((e: any) => [fmtDate(e.occurred_at), e.period ?? '-', String(e.kind ?? '').replace(/_/g, ' '), <span className={Number(e.cents) < 0 ? 'text-destructive' : ''}>{money(Number(e.cents))}</span>, e.reason ?? '-'])} />
      </Section>
    </div>
  )
}
