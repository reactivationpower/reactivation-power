import { useState } from 'react'
import { Link } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as R from '@/app/actions/resellers'
import { Section, StatusPill, Table, btn2Cls, btnCls, fmtDate, inputCls, money } from '@/components/affiliates/shared'
import { Field } from '@/components/affiliates/shared'
import { Finance, QueryError, Skeleton, TF } from '@/components/resellers/ui'

export default function ResellersWorkspacePage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState(''); const [applied, setApplied] = useState(''); const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['reseller-workspace', applied, page], queryFn: () => R.getWorkspace(applied, page), placeholderData: (p) => p })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ fullName: '', businessName: '', email: '', phone: '', businessAddress: '', consentEvidence: '' })
  const [err, setErr] = useState('')
  const create = useMutation({
    mutationFn: () => R.createProspect({ fullName: f.fullName.trim(), businessName: f.businessName.trim(), email: f.email.trim(), phone: f.phone.trim(), businessAddress: f.businessAddress.trim(), consentEvidence: f.consentEvidence.trim() }),
    onSuccess: () => { toast.success('Prospect added'); setF({ fullName: '', businessName: '', email: '', phone: '', businessAddress: '', consentEvidence: '' }); setOpen(false); qc.invalidateQueries({ queryKey: ['reseller-workspace'] }) },
    onError: (e) => setErr((e as Error).message),
  })
  if (q.isLoading) return <Skeleton />
  const d = q.data
  if (q.isError || !d) return <QueryError error={q.error} onRetry={() => q.refetch()} busy={q.isFetching} />
  const manager = d.actor.role === 'reseller_manager'
  const ended = Boolean(d.company.terminated_at)
  const pages = Math.max(1, Math.ceil(d.total / 50))
  const names = new Map(d.members.map((m) => [m.user_id, m.name]))
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{d.company.business_name}</p>
          <h1 className="mt-1 text-2xl font-semibold">{manager ? 'Company workspace' : 'My prospects'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Contact prospects yourself by phone or email outside this system. Log what happened here.</p>
        </div>
        {!ended && <button className={btnCls} data-testid="button-new-prospect" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add prospect'}</button>}
      </header>
      {ended && <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm" data-testid="text-ended">This reseller relationship has ended. Selling is closed.</p>}
      {!d.prices && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-prices-missing">Selling is unavailable until Patient Pipeline sets standard prices.</p>}
      {d.prices && <p className="text-sm text-muted-foreground">Standard prices: {money(d.prices.lifetime_cents)} lifetime, {money(d.prices.monthly_cents)}/mo, {money(d.prices.setup_cents)} setup.</p>}
      {open && (
        <form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); setErr(''); create.mutate() }}>
          <div className="grid gap-3 md:grid-cols-2">
            <TF l="Contact name" v={f.fullName} set={(v) => setF({ ...f, fullName: v })} id="input-prospect-name" />
            <TF l="Business name" v={f.businessName} set={(v) => setF({ ...f, businessName: v })} id="input-prospect-business" />
            <TF l="Email" t="email" v={f.email} set={(v) => setF({ ...f, email: v })} id="input-prospect-email" />
            <TF l="Phone" t="tel" v={f.phone} set={(v) => setF({ ...f, phone: v })} id="input-prospect-phone" />
          </div>
          <TF l="Business address" req={false} v={f.businessAddress} set={(v) => setF({ ...f, businessAddress: v })} id="input-prospect-address" />
          <Field label="Consent evidence (optional)" hint="How this person agreed to be contacted."><textarea rows={2} className={inputCls} value={f.consentEvidence} onChange={(e) => setF({ ...f, consentEvidence: e.target.value })} data-testid="input-prospect-consent" /></Field>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <button className={btnCls} disabled={create.isPending} data-testid="button-create-prospect">Save prospect</button>
        </form>
      )}
      <Section title={manager?'Company customers and offers':'My customers and offers'} desc="Sales remain attributed to their original salesperson when a prospect is reassigned.">
        <Table head={['Customer','Business','Offer','Enrollment','Subscription','Agreement']} empty="No offers yet."
          rows={d.sales.map(s=>[
            <Link className="font-medium text-primary underline" href={`/resellers/customers/${s.link_id}`}>{s.customer_name}</Link>,
            s.business_name,s.type==='one_time'?'Lifetime':'Monthly',s.completed_at?'Completed':'In progress',
            s.subscription_status||'Not started',s.agreement_status||'Not sent',
          ])} />
      </Section>
      {manager && d.report && (
        <>
          <Finance report={d.report} title="Company earnings and payments" />
          <Section title="Team" desc="Invitations and access are managed by Patient Pipeline.">
            <Table empty="No team members." head={['Member', 'Role', 'Status']} rows={d.members.map((m) => [m.name, m.role === 'reseller_manager' ? 'Manager' : 'Salesperson', <StatusPill s={m.active ? 'active' : 'inactive'} />])} />
            <Link href="/resellers/onboarding" className={btn2Cls + ' mt-3'} data-testid="link-onboarding">Payment details ({d.report.onboarding_status ?? 'incomplete'})</Link>
          </Section>
        </>
      )}
      <Section title={manager ? 'All prospects' : 'Prospects'} desc={`${d.total} total`}>
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search.trim()) }}>
          <input data-testid="input-search" className={inputCls} placeholder="Search name, business, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className={btn2Cls} data-testid="button-search">Search</button>
          {applied && <button type="button" className={btn2Cls} onClick={() => { setSearch(''); setApplied(''); setPage(1) }}>Clear</button>}
        </form>
        <Table empty={applied ? 'No prospects match that search.' : 'No prospects yet. Add the first one to start.'}
          head={['Prospect', 'Business', 'Stage', ...(manager ? ['Owner'] : []), 'Next follow-up', '']}
          rows={d.prospects.map((p) => [<span>{p.full_name}<span className="block text-xs text-muted-foreground">{p.email}</span></span>, p.business_name, <StatusPill s={p.stage} />, ...(manager ? [names.get(p.salesperson_id) ?? '-'] : []), p.next_followup_at ? fmtDate(p.next_followup_at) : '-',
            <Link href={`/resellers/prospects/${p.id}`} data-testid={`link-prospect-${p.id}`} className="font-medium underline">Open</Link>])} />
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button className={btn2Cls} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-muted-foreground">Page {d.page} of {pages}</span>
          <button className={btn2Cls} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </Section>
      <Section title="Demos" desc="Show prospects the real product. These open the existing public demo pages.">
        <div className="flex flex-wrap gap-2">
          <a className={btn2Cls} href="/demo" target="_blank" rel="noopener noreferrer" data-testid="link-demo">Product demo</a>
          <a className={btn2Cls} href="/training-demo" target="_blank" rel="noopener noreferrer" data-testid="link-training-demo">Training demo</a>
        </div>
      </Section>
    </div>
  )
}
