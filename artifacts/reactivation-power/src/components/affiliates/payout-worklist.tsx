import { useState } from 'react'
import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { getAffiliatePayoutWorklist, type PayoutWorklistRow } from '@/app/actions/affiliates'
import { Field, Stat, StatusPill, Table, btn2Cls, inputCls, money } from './shared'

function notificationCount(r: PayoutWorklistRow) {
  return Object.values(r.notifications).reduce((s, n) => s + n, 0)
}
function notices(r: PayoutWorklistRow) {
  const states = Object.entries(r.notifications).filter(([, n]) => n > 0)
  return states.length ? <span className="text-xs">{states.map(([s, n]) => `${n} ${s}`).join(' · ')}</span> : <span className="text-muted-foreground">None outstanding</span>
}
export function PayoutWorklist() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [filter, setFilter] = useState('attention')
  const [search, setSearch] = useState('')
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
  const q = useQuery({ queryKey: ['affiliate-payout-worklist', period], queryFn: () => getAffiliatePayoutWorklist(period),
    enabled: valid, staleTime: 0, refetchOnMount: 'always', refetchInterval: 60000 })
  const rows = (q.data?.rows ?? []).filter(r => r.affiliate.business_name.toLowerCase().includes(search.toLowerCase())).filter(r =>
    filter === 'all' || (filter === 'wires' ? r.wireable_cents > 0 : filter === 'debts' ? r.balance_cents < 0 :
      r.balance_cents !== 0 || r.remaining_cents !== 0 || notificationCount(r) > 0))
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5" data-testid="payout-worklist">
      <div><h2 className="text-lg font-semibold">Monthly payout worklist</h2>
        <p className="mt-1 text-sm text-muted-foreground">Send wires outside this app, then record them on the partner’s profile. No minimum or holding period. Debts carry forward, including for inactive partners.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Earning month"><input type="month" required className={inputCls} value={period} onChange={e => setPeriod(e.target.value)} data-testid="input-payout-month" /></Field>
        <Field label="Show"><select className={inputCls} value={filter} onChange={e => setFilter(e.target.value)} data-testid="select-payout-filter">
          <option value="attention">Needs attention</option><option value="wires">Wire due</option><option value="debts">Negative balance</option><option value="all">All partners</option>
        </select></Field>
        <Field label="Partner"><input className={inputCls} placeholder="Search by name" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-payout-search" /></Field>
        <button className={btn2Cls} disabled={!valid || q.isFetching} onClick={() => q.refetch()} data-testid="button-payout-refresh">Refresh</button>
      </div>
      {!valid ? <p role="alert">Choose an earning month.</p> : q.isLoading ? <div className="h-32 animate-pulse rounded-xl bg-muted" /> : q.isError ? (
        <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : q.data && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Month gross" value={money(q.data.totals.gross_cents)} />
          <Stat label="Month corrections" value={money(q.data.totals.corrections_cents)} />
          <Stat label="Wires recorded for month" value={money(q.data.totals.paid_cents)} />
          <Stat label="Current net balance" value={money(q.data.totals.balance_cents)} />
          <Stat label="Available to wire for month" value={money(q.data.totals.wireable_cents)} />
        </div>
        <p className="text-xs text-muted-foreground">Totals include all partners, regardless of filters. Month close includes carry-forward through {period}; current net includes all earnings, corrections and recorded wires. Available to wire also accounts for later corrections and all prior wires. Outstanding email states cover all months and do not mean the wire failed.</p>
        <Table empty="No partners match this view." head={['Partner', 'Status', 'Opening', 'Gross', 'Corrections', 'Recorded', 'Month close', 'Current net', 'Available to wire', 'Notifications', '']}
          rows={rows.map(r => [
            r.affiliate.business_name, <StatusPill s={r.affiliate.status} />, money(r.opening_balance_cents),
            money(r.gross_cents), money(r.corrections_cents), money(r.paid_cents), money(r.remaining_cents),
            money(r.balance_cents), money(r.wireable_cents), notices(r),
            <Link href={`/admin/affiliates/${r.affiliate.id}?wirePeriod=${period}#record-wire`} data-testid={`link-payout-${r.affiliate.id}`} className="font-medium underline">Review / record wire</Link>,
          ])} />
      </>}
    </section>
  )
}
