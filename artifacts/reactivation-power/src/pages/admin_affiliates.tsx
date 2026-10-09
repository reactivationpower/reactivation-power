import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listAffiliates, saveAffiliate } from '@/app/actions/affiliates'
import { Field, RulesEditor, StatusPill, Table, btnCls, btn2Cls, defaultDrafts, draftsToRules, inputCls } from '@/components/affiliates/shared'

export default function AdminAffiliatesPage() {
  const qc = useQueryClient()
  const [, nav] = useLocation()
  const q = useQuery({ queryKey: ['affiliates'], queryFn: listAffiliates })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [reason, setReason] = useState('')
  const [rules, setRules] = useState(defaultDrafts()); const [filter, setFilter] = useState(''); const [err, setErr] = useState('')
  const m = useMutation({
    mutationFn: () => saveAffiliate({ businessName: name.trim(), email: email.trim(), status: 'approved', rules: draftsToRules(rules), reason: reason.trim() }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['affiliates'] }); nav(`/admin/affiliates/${r.id}`) },
    onError: (e) => setErr((e as Error).message),
  })
  const list = (q.data ?? []).filter((a) => `${a.business_name} ${a.email} ${a.referral_code}`.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Affiliates</h1><p className="mt-1 text-sm text-muted-foreground">Partners, applications and commission defaults.</p></div>
        <button data-testid="button-new-affiliate" className={btnCls} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add partner'}</button>
      </header>
      {open && (
        <form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); setErr(''); try { draftsToRules(rules); m.mutate() } catch (x) { setErr((x as Error).message) } }}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Business name"><input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-new-name" /></Field>
            <Field label="Inbox email"><input required type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-new-email" /></Field>
          </div>
          <RulesEditor prefix="new" value={rules} onChange={setRules} />
          <Field label="Reason (audited)"><input required className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-new-reason" /></Field>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <button className={btnCls} disabled={m.isPending} data-testid="button-create-affiliate">Create approved partner</button>
        </form>
      )}
      <input data-testid="input-filter" placeholder="Filter by name, email or code" className={inputCls + ' max-w-sm'} value={filter} onChange={(e) => setFilter(e.target.value)} />
      {q.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : q.isError ? (
        <div className="space-y-2"><p className="text-sm text-destructive">{(q.error as Error).message}</p><button className={btn2Cls} onClick={() => q.refetch()}>Retry</button></div>
      ) : (
        <Table empty="No partners yet. Applications appear here as pending."
          head={['Partner', 'Email', 'Code', 'Status', 'Applied', '']}
          rows={list.map((a) => [a.business_name, a.email, <span className="font-mono text-xs">{a.referral_code}</span>, <StatusPill s={a.status} />, new Date(a.created_at).toLocaleDateString(),
            <Link href={`/admin/affiliates/${a.id}`} data-testid={`link-affiliate-${a.id}`} className="font-medium underline">Manage</Link>])} />
      )}
    </div>
  )
}
