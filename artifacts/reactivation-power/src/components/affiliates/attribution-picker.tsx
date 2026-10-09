import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as A from '@/app/actions/affiliates'
import type { AttributionCustomer, AttributionLead } from '@/app/actions/affiliates'
import { btn2Cls, btnCls, inputCls } from '@/components/affiliates/shared'
import { cn } from '@/lib/utils'

type Kind = 'lead' | 'customer'
type Candidate = { kind: 'lead'; row: AttributionLead } | { kind: 'customer'; row: AttributionCustomer }
const MISSING = 'Name not on file'

const dateFmt = (s: string | null) => { if (!s) return ''; const d = new Date(s); return isNaN(+d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
const nameOf = (c: Candidate) => c.row.full_name?.trim() || null
const orgOf = (c: Candidate) => (c.kind === 'lead' ? c.row.practice_name : c.row.business_name)?.trim() || null
const isConverted = (c: Candidate) => c.kind === 'lead' && !!(c.row.converted_customer_id || c.row.converted_at)

function partnerText(c: Candidate, currentId: string) {
  if (!c.row.affiliate_id) return 'No partner attributed'
  if (c.row.affiliate_id === currentId) return `Attributed to this partner${c.row.affiliate_name ? ` (${c.row.affiliate_name})` : ''}`
  return `Attributed to ${c.row.affiliate_name?.trim() || 'another partner (name unavailable)'}`
}
function statusLines(c: Candidate): string[] {
  if (c.kind !== 'lead') return []
  const out: string[] = []
  const pu = c.row.protected_until
  if (pu) out.push(new Date(pu) > new Date() ? `Protected until ${dateFmt(pu)}` : `Protection ended ${dateFmt(pu)}`)
  else out.push('No protection window')
  out.push(isConverted(c) ? `Converted to customer${c.row.converted_at ? ` on ${dateFmt(c.row.converted_at)}` : ''}` : 'Not converted')
  return out
}

function CandidateBody({ c, currentId }: { c: Candidate; currentId: string }) {
  const name = nameOf(c); const org = orgOf(c)
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn('break-words text-sm font-semibold [overflow-wrap:anywhere]', !name && 'italic text-muted-foreground')} data-testid="text-candidate-name">{name ?? MISSING}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.kind === 'lead' ? 'Lead' : 'Customer'}</span>
      </div>
      <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {org ?? (c.kind === 'lead' ? 'Practice not on file' : 'Business not on file')}
        {' · '}{c.row.email?.trim() || 'Email not on file'}
      </p>
      <p className="text-xs text-foreground/80 [overflow-wrap:anywhere]">{[partnerText(c, currentId), ...statusLines(c)].join(' · ')}</p>
    </div>
  )
}

export function AttributionPicker({ affiliateId, onSaved }: { affiliateId: string; onSaved: () => Promise<unknown> | void }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<'' | Kind>('')
  const [draft, setDraft] = useState(''); const [search, setSearch] = useState('')
  const [requested, setRequested] = useState(false)
  const [sel, setSel] = useState<{ kind: Kind; id: string } | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<'' | 'assign' | 'clear'>('')
  const lock = useRef(false)

  const list = useQuery({
    queryKey: ['affiliate-candidates', 'search', kind || 'all', search],
    queryFn: () => A.getAffiliateAttributionCandidates(search, kind || undefined),
    enabled: requested,
    retry: false,
  })
  const selQ = useQuery({
    queryKey: ['affiliate-candidates', 'selected', sel?.kind, sel?.id],
    queryFn: () => A.getAffiliateAttributionCandidates(sel!.id, sel!.kind),
    enabled: !!sel,
    retry: false,
  })
  const selected: Candidate | null = (() => {
    if (!sel || !selQ.data) return null
    if (sel.kind === 'lead') { const r = selQ.data.leads.find((x) => x.id === sel.id); return r ? { kind: 'lead', row: r } : null }
    const r = selQ.data.customers.find((x) => x.id === sel.id); return r ? { kind: 'customer', row: r } : null
  })()

  const results: Candidate[] = [
    ...(kind !== 'customer' ? (list.data?.leads ?? []).map((row) => ({ kind: 'lead' as const, row })) : []),
    ...(kind !== 'lead' ? (list.data?.customers ?? []).map((row) => ({ kind: 'customer' as const, row })) : []),
  ]

  const changeKind = (k: '' | Kind) => { setKind(k); setSel(null); setErr('') }
  const converted = selected ? isConverted(selected) : false
  const canAct = !!selected && !!reason.trim() && !pending && !converted && !selQ.isError && !selQ.isFetching
  const canAssign = canAct && !converted

  const run = async (mode: 'assign' | 'clear') => {
    if (lock.current || !sel || !selected || !reason.trim()) return
    if (!canAct) return
    lock.current = true; setPending(mode); setErr('')
    try {
      await A.assignAffiliate({ affiliateId: mode === 'assign' ? affiliateId : null, [sel.kind === 'lead' ? 'leadId' : 'customerId']: sel.id, reason: reason.trim() })
      setReason('')
      toast.success(mode === 'assign' ? 'Attribution saved' : 'Attribution cleared')
      await Promise.all([qc.invalidateQueries({ queryKey: ['affiliate-candidates'] }), onSaved()])
    } catch (e) {
      setErr((e as Error).message || 'Unable to save attribution')
    } finally { lock.current = false; setPending('') }
  }

  return (
    <div className="min-w-0 space-y-4" data-testid="attribution-picker">
      <div role="search" className="space-y-2">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Record type">
          {([['', 'All'], ['lead', 'Leads'], ['customer', 'Customers']] as const).map(([k, l]) => (
            <button key={l} type="button" disabled={!!pending} role="radio" aria-checked={kind === k} data-testid={`filter-attr-kind-${k || 'all'}`} onClick={() => changeKind(k)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}>{l}</button>
          ))}
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setRequested(true); if (requested && search === draft.trim()) void list.refetch(); else setSearch(draft.trim()) }}>
          <label className="sr-only" htmlFor="attr-search">Search by name, practice, email, or exact ID</label>
          <input id="attr-search" data-testid="input-candidate-search" className={inputCls + ' min-w-0'} placeholder="Search name, practice, email, or exact ID" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button disabled={list.isFetching} className={btn2Cls} data-testid="button-candidate-search">Search</button>
        </form>
      </div>

      <div aria-live="polite" aria-busy={list.isFetching} className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2" data-testid="list-candidates">
        {!requested ? <p className="p-4 text-sm text-muted-foreground">Search to load leads and customers.</p> : list.isLoading ? (
          <div className="space-y-1.5" data-testid="status-candidates-loading"><span className="sr-only">Loading candidates</span>{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
        ) : list.isError ? (
          <div role="alert" className="space-y-2 p-2 text-sm"><p className="text-destructive">{(list.error as Error).message || 'Unable to load candidates'}</p><button type="button" className={btn2Cls} data-testid="button-candidates-retry" onClick={() => list.refetch()}>Retry</button></div>
        ) : results.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground" data-testid="text-candidates-empty">{search ? 'No matches. Try a name, practice, email, or exact ID.' : 'No leads or customers available.'}</p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((c) => {
              const active = sel?.kind === c.kind && sel.id === c.row.id
              return (
                <li key={`${c.kind}-${c.row.id}`}>
                  <button type="button" disabled={!!pending} aria-pressed={active} data-testid={`candidate-${c.kind}-${c.row.id}`} onClick={() => { setSel({ kind: c.kind, id: c.row.id }); setErr('') }}
                    className={cn('block w-full rounded-md border px-3 py-2 text-left transition-colors', active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:bg-muted')}>
                    <CandidateBody c={c} currentId={affiliateId} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3" data-testid="panel-attr-selection" aria-live="polite">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Selected record</p>
        {!sel ? <p className="text-sm text-muted-foreground" data-testid="text-no-selection">Choose a lead or customer above.</p>
          : selQ.isLoading ? <div className="h-12 animate-pulse rounded-md bg-muted" data-testid="status-selection-loading" />
          : selQ.isError ? <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">{(selQ.error as Error).message || 'Unable to load selection'}</p><button type="button" className={btn2Cls} onClick={() => selQ.refetch()} data-testid="button-selection-retry">Retry</button></div>
          : !selected ? <p className="text-sm text-destructive" role="alert">This record is no longer available. Choose another.</p>
          : <div data-testid="summary-attr-selected"><CandidateBody c={selected} currentId={affiliateId} />
              {converted && <p className="mt-2 text-xs text-destructive" data-testid="text-converted-guidance">This lead already converted to a customer. Switch to Customers and assign the converted customer record instead.</p>}
            </div>}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason (required, audited)</span>
        <input data-testid="input-attr-reason" disabled={!!pending} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      {err && <p role="alert" className="text-sm text-destructive" data-testid="text-attr-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnCls} disabled={!canAssign} data-testid="button-assign" onClick={() => run('assign')}>{pending === 'assign' ? 'Saving...' : 'Assign to this partner'}</button>
        <button type="button" className={btn2Cls} disabled={!canAct} data-testid="button-unassign" onClick={() => run('clear')}>{pending === 'clear' ? 'Clearing...' : 'Clear attribution'}</button>
      </div>
      {!pending && (!sel || !reason.trim()) && <p className="text-xs text-muted-foreground">Select a record and enter a reason to continue.</p>}
    </div>
  )
}
