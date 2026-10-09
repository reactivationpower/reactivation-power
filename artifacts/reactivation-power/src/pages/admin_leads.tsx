import { useState } from 'react'
import { Link } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createSalesLead } from '@/app/actions/sales-leads'
import { SALES_STAGES } from '@workspace/shared/sales-leads'
import { Banner, Empty, ErrorBox, Field, LeadsTabs, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp, useDashboard } from '@/components/leads/ui'

const blank = { firstName: '', lastName: '', email: '', phone: '', practiceName: '', notes: '', affiliateId: '' }

export default function AdminLeadsPage() {
  const qc = useQueryClient()
  const [query, setQuery] = useState(''); const [stage, setStage] = useState(''); const [source, setSource] = useState('')
  const [assignee, setAssignee] = useState(''); const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false); const [f, setF] = useState(blank); const [err, setErr] = useState('')
  const input = { query: query || undefined, stage: stage || undefined, source: source || undefined, assignee: assignee || undefined, page }
  const q = useDashboard(input)
  const team = q.data?.team ?? []
  const nameOf = (id: string | null) => !id ? 'Unassigned' : team.find((t) => t.id === id)?.name || team.find((t) => t.id === id)?.email || 'Unknown'
  const create = useMutation({
    mutationFn: () => createSalesLead({ firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), phone: f.phone.trim(), practiceName: f.practiceName.trim(), notes: f.notes.trim() || undefined, affiliateId: f.affiliateId.trim() || undefined }),
    onSuccess: () => { toast.success('Lead added'); setF(blank); setOpen(false); setErr(''); qc.invalidateQueries({ queryKey: ['sales-leads'] }) },
    onError: (e) => setErr(errMsg(e)),
  })
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const sources = Array.from(new Set(['website','affiliate','manual','gohighlevel', ...(q.data?.leads ?? []).map((l) => l.source)]))
  const total = q.data?.total ?? 0
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Provider and practice sales pipeline. Separate from practice patient queues.</p>
        </div>
        <button className={btn} onClick={() => setOpen(!open)} data-testid="button-new-lead">{open ? 'Close' : 'Add lead manually'}</button>
      </header>
      <LeadsTabs />
      {q.data && !q.data.settings.default_assignee_id && <Banner kind="warn">No default assignee is set, so new leads stay unassigned. <Link href="/admin/leads/settings" className="font-medium underline">Open settings</Link></Banner>}
      {open && (
        <form className={card + ' space-y-4'} onSubmit={(e) => { e.preventDefault(); setErr(''); create.mutate() }} data-testid="form-new-lead">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="First name"><input required className={inp} value={f.firstName} onChange={set('firstName')} data-testid="input-first-name" /></Field>
            <Field label="Last name"><input required className={inp} value={f.lastName} onChange={set('lastName')} data-testid="input-last-name" /></Field>
            <Field label="Practice"><input required className={inp} value={f.practiceName} onChange={set('practiceName')} data-testid="input-practice" /></Field>
            <Field label="Email"><input required type="email" className={inp} value={f.email} onChange={set('email')} data-testid="input-email" /></Field>
            <Field label="Phone"><input required type="tel" className={inp} value={f.phone} onChange={set('phone')} data-testid="input-phone" /></Field>
            <Field label="Affiliate ID (optional)"><input className={inp} value={f.affiliateId} onChange={set('affiliateId')} data-testid="input-affiliate" /></Field>
          </div>
          <Field label="Opening note (optional)"><textarea rows={3} className={inp} value={f.notes} onChange={set('notes')} data-testid="input-notes" /></Field>
          {err && <Banner kind="error">{err}</Banner>}
          <button className={btn} disabled={create.isPending} data-testid="button-create-lead">{create.isPending ? 'Saving...' : 'Create lead'}</button>
        </form>
      )}
      <div className="grid gap-2 md:grid-cols-5">
        <input className={inp + ' md:col-span-2'} placeholder="Search name, email, phone, practice" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} data-testid="input-search" />
        <select className={inp} value={stage} onChange={(e) => { setStage(e.target.value); setPage(1) }} data-testid="select-stage">
          <option value="">All stages</option>{SALES_STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={inp} value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }} data-testid="select-source">
          <option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={inp} value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1) }} data-testid="select-assignee">
          <option value="">All assignees</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
        </select>
      </div>
      {q.isLoading ? <Skeleton /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : !q.data?.leads.length ? (
        <Empty title="No leads match" body="Add a lead manually, change filters, or review a manual import." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>{['Contact', 'Practice', 'Stage', 'Source', 'Assignee', 'Next follow-up', 'Sync'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {q.data.leads.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/40" data-testid={`row-lead-${l.id}`}>
                  <td className="px-4 py-3"><Link href={`/admin/leads/${l.id}`} className="font-medium underline-offset-2 hover:underline" data-testid={`link-lead-${l.id}`}>{l.first_name} {l.last_name}</Link>
                    <div className="text-xs text-muted-foreground">{l.email}</div></td>
                  <td className="px-4 py-3">{l.practice_name}</td>
                  <td className="px-4 py-3"><Pill>{l.stage}</Pill>{l.dnd && <span className="ml-1"><Pill tone="bg-destructive/15 text-destructive">DND</Pill></span>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.source}{l.historical ? ' (historical)' : ''}</td>
                  <td className="px-4 py-3">{nameOf(l.assignee_id)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt(l.next_followup_at, l.timezone)}</td>
                  <td className="px-4 py-3"><Pill tone={l.sync_state === 'synced' ? 'bg-success/15 text-success' : l.sync_state === 'error' || l.sync_state === 'failed' ? 'bg-destructive/15 text-destructive' : undefined}>{l.sync_state}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="text-total">{total} lead{total === 1 ? '' : 's'} · page {page}</span>
        <div className="flex gap-2">
          <button className={btn2} disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-prev">Previous</button>
          <button className={btn2} disabled={(q.data?.leads.length ?? 0) === 0 || (q.data?.leads.length ?? 0) < 1 || page * (q.data?.leads.length || 1) >= total} onClick={() => setPage(page + 1)} data-testid="button-next">Next</button>
        </div>
      </div>
    </div>
  )
}
