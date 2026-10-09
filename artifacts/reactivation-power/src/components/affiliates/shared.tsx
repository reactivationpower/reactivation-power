import { useState, Fragment, type ReactNode } from 'react'
import type { AffiliateRules, Report, Rule } from '@/app/actions/affiliates'
import { cn } from '@/lib/utils'

export const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const dollarsToCents = (s: string) => {
  const n = Number(s.trim())
  if (!s.trim() || !Number.isFinite(n)) throw new Error('Enter a valid dollar amount')
  return Math.round(n * 100)
}
export const fmtDate = (s: string) => { const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString() }
export const newKey = (): string => crypto.randomUUID()

export function ruleLabel(r: Rule, which: 'monthly' | 'one_time') {
  if (r.kind === 'percent') return `${(r.value / 100).toFixed(2).replace(/\.?0+$/, '')}% of ${which === 'monthly' ? 'each collected monthly payment' : 'each collected one-time sale'}`
  return `${money(r.value)} ${which === 'monthly' ? 'per successful monthly payment' : 'per closed paid sale'}`
}

export const inputCls = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40'
export const btnCls = 'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
export const btn2Cls = 'inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}
export function Section({ title, desc, children, id }: { title: string; desc?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {desc ? <p className="mt-1 mb-4 text-sm text-muted-foreground">{desc}</p> : <div className="mb-4" />}
      {children}
    </section>
  )
}

/* Rule editor: percent entered as percent (stored as basis points), flat as dollars (stored as cents) */
export interface RuleDraft { kind: 'percent' | 'flat'; input: string }
export const ruleToDraft = (r: Rule): RuleDraft => ({ kind: r.kind, input: r.kind === 'percent' ? String(r.value / 100) : (r.value / 100).toFixed(2) })
export function draftToRule(d: RuleDraft): Rule {
  const n = Number(d.input)
  if (!d.input.trim() || !Number.isFinite(n) || n < 0) throw new Error('Rule values must be zero or greater')
  return { kind: d.kind, value: Math.round(n * 100) }
}
export const rulesToDrafts = (r: AffiliateRules) => ({ monthly: ruleToDraft(r.monthly), one_time: ruleToDraft(r.one_time) })
export const draftsToRules = (d: { monthly: RuleDraft; one_time: RuleDraft }): AffiliateRules => ({ monthly: draftToRule(d.monthly), one_time: draftToRule(d.one_time) })
export const defaultDrafts = () => ({ monthly: { kind: 'percent', input: '10' } as RuleDraft, one_time: { kind: 'percent', input: '10' } as RuleDraft })

export function RulesEditor({ value, onChange, prefix }: { value: { monthly: RuleDraft; one_time: RuleDraft }; onChange: (v: { monthly: RuleDraft; one_time: RuleDraft }) => void; prefix: string }) {
  const row = (k: 'monthly' | 'one_time', title: string) => {
    const d = value[k]
    const bps = d.kind === 'percent' && Number.isFinite(Number(d.input)) ? Math.round(Number(d.input) * 100) : null
    return (
      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <select data-testid={`${prefix}-${k}-kind`} className={inputCls} value={d.kind} onChange={(e) => onChange({ ...value, [k]: { ...d, kind: e.target.value as any } })}>
            <option value="percent">Percent</option>
            <option value="flat">Flat</option>
          </select>
          <input data-testid={`${prefix}-${k}-value`} className={inputCls} inputMode="decimal" value={d.input} onChange={(e) => onChange({ ...value, [k]: { ...d, input: e.target.value } })} />
        </div>
        <p className="text-xs text-muted-foreground">
          {d.kind === 'percent'
            ? `Percent of collected payments. Stored as ${bps ?? '?'} basis points (1000 = 10%).`
            : `Dollars. Stored as integer cents. ${k === 'monthly' ? 'Paid per successful monthly payment.' : 'Paid per closed paid sale.'}`}
        </p>
      </div>
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {row('monthly', 'Monthly subscription')}
      {row('one_time', 'One-time sale')}
      <p className="md:col-span-2 text-xs text-muted-foreground">Setup fees are never commissioned.</p>
    </div>
  )
}

export function StatusPill({ s }: { s: string }) {
  const tone = /approved|paid|sent|closed/.test(s) ? 'bg-success/15 text-success' : /fail|reject|revoked|error/.test(s) ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', tone)}>{s.replace(/_/g, ' ')}</span>
}

export function PrivacyNote() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground" data-testid="text-privacy">
      Privacy: partner access is an authenticated affiliate inbox account, not an identified human. Where reliable, we record an approximate trusted IP-derived region or country only. IP and location data are retained for 30 days and navigation records for 90 days. Financial and audit records are retained.
    </p>
  )
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'neg'; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', tone === 'neg' && 'text-destructive')} data-testid={`stat-${label.toLowerCase().replace(/\W+/g, '-')}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function ReportView({ report, tab, onTab, extraPayoutAction, onPracticeView }: { report: Report; onPracticeView?: (customerId: string) => void; tab?: string; onTab?: (t: string) => void; extraPayoutAction?: (id: string) => ReactNode }) {
  const [local, setLocal] = useState('periods')
  const [open, setOpen] = useState<string | null>(null)
  const cur = tab ?? local
  const set = (t: string) => { setLocal(t); onTab?.(t) }
  const bal = report.earned_cents - report.paid_cents
  const carry = report.periods.filter((p) => p.remaining_cents < 0)
  const collected = report.payments.filter(p => p.kind === 'invoice_paid').reduce((a, e) => a + e.amount_cents, 0)
  const future = report.practices.filter((p) => p.active).reduce((a, p) => a + p.estimated_next_commission_cents, 0)
  const tabs = [['periods', 'Periods'], ['practices', 'Practices'], ['payments', 'Earnings history'], ['payouts', 'Wire payments']]
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Earned" value={money(report.earned_cents)} />
        <Stat label="Paid" value={money(report.paid_cents)} />
        <Stat label="Balance" value={money(bal)} tone={bal < 0 ? 'neg' : undefined} sub={`${money(report.earned_cents)} earned - ${money(report.paid_cents)} paid = ${money(bal)}`} />
        <Stat label="Estimated future" value={money(future)} sub="Estimate only, distinct from earned and collected" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Collected history" value={money(collected)} sub="Actual collected payments; setup fees never earn commission" />
        <Stat label="Negative carryovers" value={String(carry.length)} sub={carry.length ? carry.map((p) => `${p.period}: ${money(p.remaining_cents)}`).join(' | ') : 'No period is carrying a negative balance'} tone={carry.length ? 'neg' : undefined} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Current commission rules</p>
        <ul className="space-y-1 text-sm text-muted-foreground" data-testid="list-rules">
          <li>Monthly: {ruleLabel(report.rules.monthly, 'monthly')}</li>
          <li>One-time: {ruleLabel(report.rules.one_time, 'one_time')}</li>
          <li>Setup fees are never commissioned.</li>
        </ul>
      </div>
      <div>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-border">
          {tabs.map(([k, l]) => (
            <button key={k} data-testid={`tab-${k}`} onClick={() => set(k)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', cur === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
          ))}
        </div>
        {cur === 'periods' && (
          <Table empty="No periods yet. Earnings appear after the first collected payment."
            head={['Period', 'Opening / carry', 'Gross', 'Corrections', 'Net', 'Payable', 'Paid', 'Remaining', 'State']}
            rows={report.periods.map((p) => [p.period, p.opening_balance_cents == null ? '-' : money(p.opening_balance_cents), money(p.gross_cents), money(p.corrections_cents), money(p.net_cents), p.payable_cents == null ? '-' : money(p.payable_cents), money(p.paid_cents),
              <span className={p.remaining_cents < 0 ? 'text-destructive' : ''}>{money(p.remaining_cents)}{p.paid_cents > 0 && p.remaining_cents > 0 ? ' (partial)' : ''}{p.remaining_cents < 0 ? ' (carryover)' : ''}</span>, <StatusPill s={p.state} />])} />
        )}
        {cur === 'practices' && (
          report.practices.length === 0 ? <Table head={[]} rows={[]} empty="No practices are attributed to this partner yet." /> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground"><tr>{['Practice', 'Active', 'Paid', 'Est. next commission', 'Rules', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>{report.practices.map((p) => {
                const isOpen = open === p.id
                const mine = report.entries.filter((e) => e.customer_id === p.id)
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-border">
                      <td className="px-3 py-2">{p.business_name}</td><td className="px-3 py-2">{p.active ? 'Yes' : 'No'}</td><td className="px-3 py-2">{p.paid ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{money(p.estimated_next_commission_cents)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{ruleLabel(p.rules.monthly, 'monthly')}<br />{ruleLabel(p.rules.one_time, 'one_time')}</td>
                      <td className="px-3 py-2"><button data-testid={`button-practice-details-${p.id}`} className={btn2Cls} onClick={() => { if (!isOpen) onPracticeView?.(p.id); setOpen(isOpen ? null : p.id) }}>{isOpen ? 'Hide details' : 'Practice details'}</button></td>
                    </tr>
                    {isOpen && <tr className="border-t border-border bg-muted/30"><td colSpan={6} className="p-3"><Table empty="No payments for this practice yet." head={['Date', 'Period', 'Kind', 'Collected', 'Commission']} rows={mine.map((e) => [fmtDate(e.occurred_at), e.period, e.kind.replace(/_/g, ' '), money(e.collected_cents), money(e.cents)])} /></td></tr>}
                  </Fragment>
                )
              })}</tbody>
            </table>
          </div>)
        )}
        {cur === 'payments' && (
          <div className="space-y-5">
          <div><h3 className="mb-2 text-sm font-semibold">Collected payments and refunds</h3>
          <Table empty="No collected payments yet."
            head={['Practice', 'Date', 'Type', 'Collected / refunded']}
            rows={report.payments.map(p => [p.practice_name, fmtDate(p.occurred_at), p.kind === 'refund' ? 'Refund' : p.sale_type === 'setup' ? 'Setup (no commission)' : p.sale_type.replace('_', ' '), money(p.kind === 'refund' ? -p.amount_cents : p.amount_cents)])} />
          </div>
          <div><h3 className="mb-2 text-sm font-semibold">Earned commissions and corrections</h3>
          <Table empty="No earning entries recorded."
            head={['Date', 'Period', 'Kind', 'Collected', 'Commission', 'Rule']}
            rows={report.entries.map((e) => [fmtDate(e.occurred_at), e.period, e.kind.replace(/_/g, ' '), money(e.collected_cents), money(e.cents), e.rule ? ruleLabel(e.rule, e.rule.saleType ?? (/month/.test(e.kind) ? 'monthly' : 'one_time')) : '-'])} />
          </div></div>
        )}
        {cur === 'payouts' && (
          <Table empty="No wire payments recorded."
            head={['Payment date', 'Period', 'Amount', 'Reference', 'Notification', '']}
            rows={report.payouts.map((p) => [p.payment_date, p.period, money(p.amount_cents), <span className="font-mono text-xs">{p.reference}</span>,
              <span><StatusPill s={p.notification_status} />{p.notification_error ? <span className="mt-1 block text-xs text-destructive">{p.notification_error}</span> : null}</span>, extraPayoutAction?.(p.id) ?? null])} />
        )}
      </div>
    </div>
  )
}
