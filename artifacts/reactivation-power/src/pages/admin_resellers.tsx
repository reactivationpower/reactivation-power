import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as R from '@/app/actions/resellers'
import { Section, StatusPill, Table, btnCls, dollarsToCents, inputCls, money } from '@/components/affiliates/shared'
import { QueryError, RForm, Skeleton, TF } from '@/components/resellers/ui'

const dollars = (c: number) => (c / 100).toFixed(2)

export default function AdminResellersPage() {
  const qc = useQueryClient(); const [, nav] = useLocation()
  const q = useQuery({ queryKey: ['resellers'], queryFn: R.listCompanies })
  const [open, setOpen] = useState(false)
  const [c, setC] = useState({ name: '', email: '', reason: '' })
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState('')
  const create = useMutation({
    mutationFn: () => R.createCompany({ businessName: c.name.trim(), email: c.email.trim(), reason: c.reason.trim() }),
    onSuccess: (r) => { toast.success('Company created'); qc.invalidateQueries({ queryKey: ['resellers'] }); nav(`/admin/resellers/${r.id}`) },
    onError: (e) => setErr((e as Error).message),
  })
  const prices = q.data?.prices
  const [p, setP] = useState({ lifetime: '', monthly: '', setup: '', reason: '' })
  useEffect(() => { if (prices) setP((x) => ({ ...x, lifetime: dollars(prices.lifetime_cents), monthly: dollars(prices.monthly_cents), setup: dollars(prices.setup_cents) })) }, [prices])
  const savePrices = useMutation({
    mutationFn: () => R.savePrices({ lifetimeCents: dollarsToCents(p.lifetime), monthlyCents: dollarsToCents(p.monthly), setupCents: dollarsToCents(p.setup), reason: p.reason.trim() }),
    onSuccess: () => { toast.success('Standard prices saved'); setP((x) => ({ ...x, reason: '' })); qc.invalidateQueries({ queryKey: ['resellers'] }); qc.invalidateQueries({ queryKey: ['reseller-workspace'] }) },
  })
  const list = (q.data?.companies ?? []).filter((x) => `${x.business_name} ${x.email}`.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Resellers</h1><p className="mt-1 text-sm text-muted-foreground">Reseller companies, their teams, standard prices and monthly wires.</p></div>
        <button className={btnCls} data-testid="button-new-company" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add company'}</button>
      </header>
      {open && (
        <form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); setErr(''); create.mutate() }}>
          <div className="grid gap-3 md:grid-cols-2">
            <TF l="Company name" v={c.name} set={(v) => setC({ ...c, name: v })} id="input-company-name" />
            <TF l="Company email" t="email" v={c.email} set={(v) => setC({ ...c, email: v })} id="input-company-email" />
          </div>
          <TF l="Reason (audited)" v={c.reason} set={(v) => setC({ ...c, reason: v })} id="input-company-reason" />
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <button className={btnCls} disabled={create.isPending} data-testid="button-create-company">Create company</button>
        </form>
      )}
      <Section title="Standard prices" desc="Approved list prices every reseller sells from. Salespeople may discount lifetime by up to $1,000 and monthly by up to $100. Setup is never discounted.">
        {q.isSuccess && !prices && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-prices-missing">No standard prices are set. Reseller selling is disabled until you save them.</p>}
        <RForm testid="button-save-prices" submit="Save standard prices" onSubmit={async () => { await savePrices.mutateAsync() }}>
          <div className="grid gap-3 md:grid-cols-3">
            <TF l="Lifetime (USD)" v={p.lifetime} set={(v) => setP({ ...p, lifetime: v })} id="input-price-lifetime" />
            <TF l="Monthly (USD)" v={p.monthly} set={(v) => setP({ ...p, monthly: v })} id="input-price-monthly" />
            <TF l="Setup (USD, 0 for none)" v={p.setup} set={(v) => setP({ ...p, setup: v })} id="input-price-setup" />
          </div>
          <TF l="Reason (audited)" v={p.reason} set={(v) => setP({ ...p, reason: v })} id="input-price-reason" />
          {prices && <p className="text-xs text-muted-foreground">Current version {prices.version}: {money(prices.lifetime_cents)} lifetime, {money(prices.monthly_cents)}/mo, {money(prices.setup_cents)} setup.</p>}
        </RForm>
      </Section>
      <input data-testid="input-filter" placeholder="Filter by company or email" className={inputCls + ' max-w-sm'} value={filter} onChange={(e) => setFilter(e.target.value)} />
      {q.isLoading ? <Skeleton n={1} /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} busy={q.isFetching} /> : (
        <Table empty="No reseller companies yet. Add one to invite its first manager."
          head={['Company', 'Email', 'Status', 'Payment details', 'Prospects', 'Sales', 'Balance', '']}
          rows={list.map((x) => [x.business_name, x.email, <StatusPill s={x.terminated_at ? 'ended' : 'active'} />, <StatusPill s={x.onboarding_status} />, x.prospect_count, x.sale_count, money(Number(x.earned_cents) - Number(x.paid_cents)),
            <Link href={`/admin/resellers/${x.id}`} data-testid={`link-company-${x.id}`} className="font-medium underline">Manage</Link>])} />
      )}
    </div>
  )
}
