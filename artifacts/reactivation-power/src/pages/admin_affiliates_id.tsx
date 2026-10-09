import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as A from '@/app/actions/affiliates'
import { Field, ReportView, RulesEditor, Section, Stat, Table, btn2Cls, btnCls, dollarsToCents, draftsToRules, fmtDate, inputCls, money, newKey, rulesToDrafts } from '@/components/affiliates/shared'

function Form({ onSubmit, children, submit, testid }: { onSubmit: () => Promise<unknown>; children: ReactNode; submit: string; testid: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await onSubmit() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
      {children}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <button className={btnCls} disabled={busy} data-testid={testid}>{busy ? 'Saving...' : submit}</button>
    </form>
  )
}
const T = (p: { l: string; v: string; set: (s: string) => void; t?: string; h?: string; id: string; req?: boolean }) => (
  <Field label={p.l} hint={p.h}><input data-testid={p.id} type={p.t ?? 'text'} required={p.req !== false} className={inputCls} value={p.v} onChange={(e) => p.set(e.target.value)} /></Field>
)

export default function AdminAffiliateProfilePage() {
  const { id = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [search, setSearch] = useState(''); const [applied, setApplied] = useState('')
  const q = useQuery({ queryKey: ['affiliate-profile', id, applied], queryFn: () => A.getAffiliateProfile(id, applied), placeholderData: (p) => p, staleTime: 0, refetchOnMount: 'always', refetchInterval: 60000 })
  const refresh = async (msg: string) => {
    toast.success(msg)
    await Promise.all([qc.invalidateQueries({ queryKey: ['affiliate-profile', id] }), qc.invalidateQueries({ queryKey: ['affiliates'] }), qc.invalidateQueries({ queryKey: ['affiliate-dashboard'] })])
  }
  const p = q.data
  const [f, setF] = useState({ name: '', email: '', status: 'approved' as A.Affiliate['status'], reason: '' })
  const [rules, setRules] = useState<ReturnType<typeof rulesToDrafts> | null>(null)
  const [init, setInit] = useState('')
  useEffect(() => { if (p && init !== p.partner.id) { setInit(p.partner.id); setF({ name: p.partner.business_name, email: p.partner.email, status: p.partner.status, reason: '' }); setRules(rulesToDrafts(p.rules)) } }, [p, init])
  const [rev, setRev] = useState(''); const [attr, setAttr] = useState({ kind: 'customer', target: '', reason: '' })
  const [ov, setOv] = useState({ customer: '', reason: '' }); const [ovRules, setOvRules] = useState<ReturnType<typeof rulesToDrafts> | null>(null)
  const [hist, setHist] = useState({ customer: '', from: '', reason: '' })
  const [led, setLed] = useState({ amount: '', reason: '', key: newKey() })
  const [wire, setWire] = useState({ period: '', amount: '', date: '', ref: '', key: newKey() })
  const [link, setLink] = useState('')
  const [cs, setCs] = useState(''); const [csA, setCsA] = useState('')
  const cand = useQuery({ queryKey: ['affiliate-candidates', csA], queryFn: () => A.getAffiliateAttributionCandidates(csA) })

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />
  if (q.isError || !p || !rules) return <div className="space-y-2"><p className="text-sm text-destructive">{(q.error as Error)?.message ?? 'Unable to load'}</p><button className={btn2Cls} onClick={() => q.refetch()}>Retry</button></div>
  const ovR = ovRules ?? rules
  const practiceSel = (v: string, set: (s: string) => void, tid: string) => (
    <div className="flex gap-2">
      <select className={inputCls + ' max-w-[14rem]'} value="" onChange={(e) => e.target.value && set(e.target.value)} data-testid={`${tid}-select`}>
        <option value="">Pick practice</option>{p.practices.map((x) => <option key={x.id} value={x.id}>{x.business_name}</option>)}
      </select>
      <input required className={inputCls} placeholder="Customer ID" value={v} onChange={(e) => set(e.target.value)} data-testid={tid} />
    </div>
  )

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/affiliates" className="text-sm text-muted-foreground underline">All affiliates</Link>
        <h1 className="mt-1 text-2xl font-semibold" data-testid="text-partner-name">{p.partner.business_name}</h1>
        <p className="text-sm text-muted-foreground">{p.partner.email} | code <span className="font-mono">{p.partner.referral_code}</span> | access version {p.partner.access_version} | {p.partner.status}</p>
      </header>
      <ReportView report={p} extraPayoutAction={(pid) => (
        <button className={btn2Cls} data-testid={`button-retry-email-${pid}`} onClick={async () => { try { await A.retryAffiliatePayoutEmail(pid); await refresh('Email retried') } catch (e) { toast.error((e as Error).message) } }}>Retry email</button>
      )} />
      <div className="grid gap-3 sm:grid-cols-2"><Stat label="Authenticated session visits" value={String(p.summary.visits)} /><Stat label="Practice views" value={String(p.summary.practice_views)} /></div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Partner defaults and status" desc="Percent in basis points under the hood (1000 = 10%); flat amounts in cents.">
          <Form testid="button-save-partner" submit="Save partner" onSubmit={async () => { await A.saveAffiliate({ id, businessName: f.name.trim(), email: f.email.trim(), status: f.status, rules: draftsToRules(rules), reason: f.reason.trim() }); setF({ ...f, reason: '' }); await refresh('Partner saved') }}>
            <T l="Business name" v={f.name} set={(v) => setF({ ...f, name: v })} id="input-name" />
            <T l="Email" t="email" v={f.email} set={(v) => setF({ ...f, email: v })} id="input-email" />
            <Field label="Status"><select data-testid="select-status" className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as any })}>{['pending', 'approved', 'inactive', 'rejected'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <RulesEditor prefix="partner" value={rules} onChange={setRules} />
            <T l="Reason" v={f.reason} set={(v) => setF({ ...f, reason: v })} id="input-reason" />
          </Form>
        </Section>

        <Section title="Invitations" desc="Access links require the inbox owner to confirm their email. Revoking bumps the access version.">
          <div className="flex flex-wrap gap-2">
            <button className={btn2Cls} data-testid="button-copy-link" onClick={async () => { try { const r = await A.getAffiliateAccessLink(id); setLink(r.url); await navigator.clipboard?.writeText(r.url).catch(() => undefined); toast.success('Access link copied'); } catch (e) { toast.error((e as Error).message) } }}>Copy Access Link</button>
            <button className={btn2Cls} data-testid="button-resend" onClick={async () => { try { const r = await A.resendAffiliateAccess(id); r.ok ? await refresh('Invitation resent') : toast.error(r.error ?? 'Resend failed') } catch (e) { toast.error((e as Error).message) } }}>Resend</button>
          </div>
          {link && <input readOnly onFocus={(e) => e.currentTarget.select()} className={inputCls + ' mt-3 font-mono text-xs'} value={link} data-testid="text-access-link" />}
          <div className="mt-5 border-t border-border pt-4">
            <Form testid="button-revoke" submit="Revoke access" onSubmit={async () => { await A.revokeAffiliateAccess(id, rev.trim()); setRev(''); setLink(''); await refresh('Access revoked') }}>
              <T l="Revocation reason" v={rev} set={setRev} id="input-revoke-reason" />
            </Form>
          </div>
        </Section>

        <Section title="Lead / customer attribution" desc="Attach this partner to a lead or customer, or clear the attribution.">
          <Form testid="button-assign" submit="Assign to this partner" onSubmit={async () => { await A.assignAffiliate({ affiliateId: id, [attr.kind === 'lead' ? 'leadId' : 'customerId']: attr.target.trim(), reason: attr.reason.trim() }); setAttr({ ...attr, reason: '' }); await refresh('Attribution saved') }}>
            <Field label="Target type"><select className={inputCls} value={attr.kind} onChange={(e) => setAttr({ ...attr, kind: e.target.value })} data-testid="select-attr-kind"><option value="customer">Customer</option><option value="lead">Lead</option></select></Field>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <input data-testid="input-candidate-search" className={inputCls} placeholder="Search leads and customers by name or ID" value={cs} onChange={(e) => setCs(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setCsA(cs.trim()) } }} />
                <button type="button" className={btn2Cls} data-testid="button-candidate-search" onClick={() => setCsA(cs.trim())}>Search</button>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {cand.isLoading ? <p className="text-xs text-muted-foreground">Searching...</p> : cand.isError ? <p className="text-xs text-destructive">{(cand.error as Error).message}</p> : (
                  <>
                    {(cand.data?.leads ?? []).map((l) => (
                      <button type="button" key={`l${l.id}`} data-testid={`candidate-lead-${l.id}`} onClick={() => setAttr({ ...attr, kind: 'lead', target: l.id })} className="block w-full rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted">
                        <span className="font-medium">Lead: {l.practice_name}</span> <span className="font-mono text-muted-foreground">{l.id}</span><br />
                        <span className="text-muted-foreground">{l.affiliate_id ? `Attributed to ${l.affiliate_id}` : 'Unattributed'}{l.protected_until ? ` | protected until ${new Date(l.protected_until).toLocaleDateString()}` : ''}{l.converted_customer_id ? ` | converted to ${l.converted_customer_id}${l.converted_at ? ' on ' + new Date(l.converted_at).toLocaleDateString() : ''}` : ' | not converted'}</span>
                      </button>
                    ))}
                    {(cand.data?.customers ?? []).map((c) => (
                      <button type="button" key={`c${c.id}`} data-testid={`candidate-customer-${c.id}`} onClick={() => setAttr({ ...attr, kind: 'customer', target: c.id })} className="block w-full rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted">
                        <span className="font-medium">Customer: {c.business_name}</span> <span className="font-mono text-muted-foreground">{c.id}</span><br />
                        <span className="text-muted-foreground">{c.affiliate_id ? `Attributed to ${c.affiliate_id}` : 'Unattributed'}</span>
                      </button>
                    ))}
                    {!(cand.data?.leads.length || cand.data?.customers.length) && <p className="text-xs text-muted-foreground">No matching leads or customers.</p>}
                  </>
                )}
              </div>
            </div>
            {attr.kind === 'customer' ? practiceSel(attr.target, (v) => setAttr({ ...attr, target: v }), 'input-attr-target') : <T l="Lead ID" v={attr.target} set={(v) => setAttr({ ...attr, target: v })} id="input-attr-target" />}
            <T l="Reason" v={attr.reason} set={(v) => setAttr({ ...attr, reason: v })} id="input-attr-reason" />
            <button type="button" className={btn2Cls} data-testid="button-unassign" onClick={async () => { try { await A.assignAffiliate({ affiliateId: null, [attr.kind === 'lead' ? 'leadId' : 'customerId']: attr.target.trim(), reason: attr.reason.trim() }); await refresh('Attribution cleared') } catch (e) { toast.error((e as Error).message) } }}>Clear attribution instead</button>
          </Form>
        </Section>

        <Section title="Customer rule override" desc="Override this partner's defaults for one customer.">
          <Form testid="button-override" submit="Save override" onSubmit={async () => { await A.setAffiliateCustomerRules({ affiliateId: id, customerId: ov.customer.trim(), rules: draftsToRules(ovR), reason: ov.reason.trim() }); setOv({ ...ov, reason: '' }); await refresh('Override saved') }}>
            {practiceSel(ov.customer, (v) => setOv({ ...ov, customer: v }), 'input-ov-customer')}
            <RulesEditor prefix="override" value={ovR} onChange={setOvRules} />
            <T l="Reason" v={ov.reason} set={(v) => setOv({ ...ov, reason: v })} id="input-ov-reason" />
          </Form>
        </Section>

        <Section title="Historical calculation" desc="Recalculate commissions for a customer from a date forward.">
          <Form testid="button-history" submit="Calculate history" onSubmit={async () => { const r = await A.calculateAffiliateHistory({ affiliateId: id, customerId: hist.customer.trim(), from: hist.from, reason: hist.reason.trim() }); await refresh(`Processed ${r.processed} payments`) }}>
            {practiceSel(hist.customer, (v) => setHist({ ...hist, customer: v }), 'input-hist-customer')}
            <T l="From" t="date" v={hist.from} set={(v) => setHist({ ...hist, from: v })} id="input-hist-from" />
            <T l="Reason" v={hist.reason} set={(v) => setHist({ ...hist, reason: v })} id="input-hist-reason" />
          </Form>
        </Section>

        <Section title="Ledger correction" desc="Signed amount in dollars; negative reduces earnings. The idempotency key prevents double submission.">
          <Form testid="button-ledger" submit="Post correction" onSubmit={async () => { await A.adjustAffiliateLedger({ affiliateId: id, cents: dollarsToCents(led.amount), reason: led.reason.trim(), key: led.key }); setLed({ amount: '', reason: '', key: newKey() }); await refresh('Correction posted') }}>
            <T l="Signed amount (USD)" h="e.g. -25.00 or 40.50" v={led.amount} set={(v) => setLed({ ...led, amount: v })} id="input-led-amount" />
            <T l="Reason" v={led.reason} set={(v) => setLed({ ...led, reason: v })} id="input-led-reason" />
            <T l="Idempotency key" v={led.key} set={(v) => setLed({ ...led, key: v })} id="input-led-key" />
          </Form>
        </Section>

        <Section title="Record monthly wire" desc="Record a wire you sent outside this system. Partial payments leave the remainder open.">
          <Form testid="button-wire" submit="Record wire" onSubmit={async () => { const r = await A.recordAffiliateWire({ affiliateId: id, period: wire.period.trim(), amountCents: dollarsToCents(wire.amount), paymentDate: wire.date, reference: wire.ref.trim(), key: wire.key }); setWire({ period: '', amount: '', date: '', ref: '', key: newKey() }); await refresh(r.emailSent ? 'Wire recorded and partner emailed' : 'Wire recorded; email not sent, retry from payments') }}>
            <Field label="Period"><select required className={inputCls} value={wire.period} onChange={(e) => setWire({ ...wire, period: e.target.value })} data-testid="select-wire-period"><option value="">Select period</option>{p.periods.map((x) => <option key={x.period} value={x.period}>{x.period} - remaining {money(x.remaining_cents)} ({x.state})</option>)}</select></Field>
            <T l="Actual amount sent (USD)" v={wire.amount} set={(v) => setWire({ ...wire, amount: v })} id="input-wire-amount" />
            <T l="Actual payment date" t="date" v={wire.date} set={(v) => setWire({ ...wire, date: v })} id="input-wire-date" />
            <T l="Bank reference" v={wire.ref} set={(v) => setWire({ ...wire, ref: v })} id="input-wire-ref" />
            <T l="Idempotency key" v={wire.key} set={(v) => setWire({ ...wire, key: v })} id="input-wire-key" />
          </Form>
        </Section>
      </div>

      <Section title="Access and audit activity" desc="Searchable. IP and location kept 30 days; navigation 90 days; financial and audit records retained.">
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()) }}>
          <input data-testid="input-activity-search" className={inputCls} placeholder="Search action, actor, reason, country..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className={btn2Cls} data-testid="button-activity-search">Search</button>
          {applied && <button type="button" className={btn2Cls} onClick={() => { setSearch(''); setApplied('') }}>Clear</button>}
        </form>
        <Table empty={applied ? 'No activity matches that search.' : 'No activity recorded.'}
          head={['When', 'Action', 'Actor', 'Customer', 'Reason', 'Region']}
          rows={p.activity.map((a) => [fmtDate(a.occurred_at), a.action.replace(/_/g, ' '), a.actor, a.customer_id ?? '-', a.reason ?? '-',
            <span className="text-xs">{[a.region, a.country].filter(Boolean).join(', ') || '-'}{a.ip ? <span className="block font-mono text-muted-foreground">{a.ip}</span> : null}</span>])} />
      </Section>
    </div>
  )
}
