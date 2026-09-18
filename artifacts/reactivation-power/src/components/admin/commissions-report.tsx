// @ts-nocheck
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { BadgeDollarSign, CheckCircle2, Loader2, Pencil, RefreshCw, Undo2, X } from 'lucide-react'

import {
  generateMissingCommissions,
  overrideCommission,
  setCommissionsPaid,
  type CommissionEntryView,
  type CommissionReport as Report,
} from '@/app/actions/commissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useRouter } from '@/hooks/use-router'
import { notifyDone, notifyError } from '@/lib/notify'

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

const SALE_TYPE_LABEL: Record<string, string> = {
  full_price: 'Full price',
  setup_fee: 'Setup fee',
  monthly: 'Monthly',
  refund: 'Refund',
}

function formatUsd(cents: number): string {
  const s = (Math.abs(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return cents < 0 ? `−${s}` : s
}
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
function formatRate(pct: number): string {
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}
/** ISO string -> value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function SaleTypePill({ entry }: { entry: CommissionEntryView }) {
  const refund = entry.saleType === 'refund'
  const label = refund
    ? `Refund${entry.refundOf ? ` · ${SALE_TYPE_LABEL[entry.refundOf].toLowerCase()}` : ''}`
    : SALE_TYPE_LABEL[entry.saleType]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        refund
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : entry.saleType === 'monthly'
            ? 'border-primary/30 bg-primary/5 text-primary'
            : 'border-border bg-card text-muted-foreground'
      }`}
    >
      {label}
    </span>
  )
}

export function CommissionsReport({ report }: { report: Report }) {
  const router = useRouter()
  const [, navigate] = useLocation()
  const search = useSearch()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<CommissionEntryView | null>(null)
  const { entries, totals, reps, filter, canManage } = report

  // Draft filter state mirrors the URL; "Apply" writes it back so the loader
  // re-runs and the URL stays shareable.
  const [rep, setRep] = useState(filter.repId ?? 'all')
  const [from, setFrom] = useState(toLocalInput(filter.from))
  const [to, setTo] = useState(toLocalInput(filter.to))
  const [paid, setPaid] = useState(filter.paid ?? 'all')
  const [type, setType] = useState(filter.saleType ?? 'all')
  useEffect(() => {
    setRep(filter.repId ?? 'all')
    setFrom(toLocalInput(filter.from))
    setTo(toLocalInput(filter.to))
    setPaid(filter.paid ?? 'all')
    setType(filter.saleType ?? 'all')
    setSelected(new Set())
  }, [filter.repId, filter.from, filter.to, filter.paid, filter.saleType])

  function applyFilters(next: Partial<{ rep: string; from: string; to: string; paid: string; type: string }> = {}) {
    const v = { rep, from, to, paid, type, ...next }
    const params = new URLSearchParams()
    if (canManage && v.rep && v.rep !== 'all') params.set('rep', v.rep)
    const fromIso = fromLocalInput(v.from)
    const toIso = fromLocalInput(v.to)
    if (fromIso) params.set('from', fromIso)
    if (toIso) params.set('to', toIso)
    if (v.paid && v.paid !== 'all') params.set('paid', v.paid)
    if (v.type && v.type !== 'all') params.set('type', v.type)
    const qs = params.toString()
    navigate(`/admin/commissions${qs ? `?${qs}` : ''}`, { replace: true })
  }
  const hasFilters = search.length > 0

  const selectable = useMemo(() => entries.filter((e) => !e.paidOutAt), [entries])
  const allSelected = selectable.length > 0 && selectable.every((e) => selected.has(e.id))
  const selectedUnpaid = entries.filter((e) => selected.has(e.id))
  const selectedCents = selectedUnpaid.reduce((sum, e) => sum + e.commissionCents, 0)

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function markPaid(ids: string[], paidOut: boolean) {
    startTransition(async () => {
      try {
        const res = await setCommissionsPaid({ ids, paid: paidOut })
        if (!res.ok) return notifyError(res.error)
        notifyDone(paidOut ? `Marked ${res.updated} ${res.updated === 1 ? 'entry' : 'entries'} paid out` : 'Payout undone')
        setSelected(new Set())
        router.refresh()
      } catch (err) {
        notifyError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  function backfill() {
    startTransition(async () => {
      try {
        const res = await generateMissingCommissions()
        if (!res.ok) return notifyError(res.error)
        notifyDone(
          res.created ? `Added ${res.created} missing ${res.created === 1 ? 'entry' : 'entries'}` : 'Nothing to add',
          `${res.scanned} payment${res.scanned === 1 ? '' : 's'} without a commission entry checked.`,
        )
        router.refresh()
      } catch (err) {
        notifyError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collected" value={formatUsd(totals.collectedCents)} sub={`${totals.entries} ${totals.entries === 1 ? 'entry' : 'entries'}`} />
        <Stat label="Commission owed" value={formatUsd(totals.commissionCents)} accent />
        <Stat label="Paid out" value={formatUsd(totals.paidOutCents)} />
        <Stat label="Unpaid" value={formatUsd(totals.unpaidCents)} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {canManage ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Rep
            <select className={`${selectClass} w-48`} value={rep} onChange={(e) => { setRep(e.target.value); applyFilters({ rep: e.target.value }) }} aria-label="Filter by rep">
              <option value="all">All reps</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          From
          <Input type="datetime-local" className="h-9 w-56" value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => applyFilters()} aria-label="From date and time" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          To
          <Input type="datetime-local" className="h-9 w-56" value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => applyFilters()} aria-label="To date and time" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Sale type
          <select className={`${selectClass} w-36`} value={type} onChange={(e) => { setType(e.target.value); applyFilters({ type: e.target.value }) }} aria-label="Filter by sale type">
            <option value="all">All types</option>
            <option value="full_price">Full price</option>
            <option value="setup_fee">Setup fee</option>
            <option value="monthly">Monthly</option>
            <option value="refund">Refunds</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Payout
          <select className={`${selectClass} w-32`} value={paid} onChange={(e) => { setPaid(e.target.value); applyFilters({ paid: e.target.value }) }} aria-label="Filter by payout status">
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid out</option>
          </select>
        </label>
        <Button variant="secondary" size="sm" onClick={() => applyFilters()}>Apply</Button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate('/admin/commissions', { replace: true })}>
            <X className="size-3.5" />
            Clear filters
          </Button>
        ) : null}
        {canManage ? (
          <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={backfill} disabled={pending} title="Create entries for payments recorded before commission tracking existed">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Generate missing entries
          </Button>
        ) : null}
      </div>

      {canManage && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            <strong>{selected.size}</strong> selected · {formatUsd(selectedCents)} commission
          </span>
          <Button size="sm" className="gap-1.5" onClick={() => markPaid([...selected], true)} disabled={pending}>
            <CheckCircle2 className="size-3.5" />
            Mark paid out
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage ? (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all unpaid entries"
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onCheckedChange={(on) => setSelected(on ? new Set(selectable.map((e) => e.id)) : new Set())}
                    />
                  </TableHead>
                ) : null}
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Customer</TableHead>
                {canManage ? <TableHead>Rep</TableHead> : null}
                <TableHead>Sale type</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-24 text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 10 : 7} className="py-12 text-center text-sm text-muted-foreground">
                    <BadgeDollarSign className="mx-auto mb-2 size-6 opacity-50" />
                    {hasFilters ? 'No commission entries match these filters.' : 'No commission entries yet. Entries appear here automatically when a payment is collected.'}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id} data-testid={`commission-row-${e.id}`} className={e.saleType === 'refund' ? 'bg-destructive/[0.03]' : undefined}>
                    {canManage ? (
                      <TableCell>
                        {e.paidOutAt ? null : (
                          <Checkbox aria-label={`Select entry for ${e.customerName}`} checked={selected.has(e.id)} onCheckedChange={(on) => toggle(e.id, Boolean(on))} />
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatWhen(e.occurredAt)}</TableCell>
                    <TableCell>
                      {e.linkId ? (
                        <Link href={`/admin/payments/${e.linkId}`} className="font-medium text-foreground hover:underline">{e.customerName || 'Customer'}</Link>
                      ) : (
                        <span className="font-medium text-foreground">{e.customerName || 'Customer'}</span>
                      )}
                      {e.businessName ? <div className="text-xs text-muted-foreground">{e.businessName}</div> : null}
                    </TableCell>
                    {canManage ? <TableCell>{e.repName || <span className="text-muted-foreground">Unknown rep</span>}</TableCell> : null}
                    <TableCell><SaleTypePill entry={e} /></TableCell>
                    <TableCell className={`text-right tabular-nums ${e.amountCents < 0 ? 'text-destructive' : ''}`}>{formatUsd(e.amountCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(e.ratePercent)}
                      {e.overridden && e.ratePercent !== e.defaultRatePercent ? (
                        <div className="text-[11px] text-muted-foreground line-through">{formatRate(e.defaultRatePercent)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${e.commissionCents < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {formatUsd(e.commissionCents)}
                      {e.overridden ? (
                        <div className="text-[11px] font-normal text-amber-700" title={e.overrideNote ?? undefined}>
                          Overridden{e.overriddenByName ? ` by ${e.overriddenByName}` : ''}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {e.paidOutAt ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success" title={`Paid out ${formatWhen(e.paidOutAt)}${e.paidOutByName ? ` by ${e.paidOutByName}` : ''}`}>
                          <span className="size-1.5 rounded-full bg-success" />
                          Paid out
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                          Unpaid
                        </span>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {e.paidOutAt ? (
                            <Button variant="ghost" size="icon" className="size-8" title="Undo payout" aria-label="Undo payout" onClick={() => markPaid([e.id], false)} disabled={pending}>
                              <Undo2 className="size-4" />
                            </Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" className="size-8" title="Override rate or amount" aria-label="Override rate or amount" onClick={() => setEditing(e)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-8" title="Mark paid out" aria-label="Mark paid out" onClick={() => markPaid([e.id], true)} disabled={pending}>
                                <CheckCircle2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing ? (
        <OverrideDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  )
}

function OverrideDialog({ entry, onClose, onSaved }: { entry: CommissionEntryView; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'rate' | 'amount' | 'reset'>('rate')
  const [rate, setRate] = useState(String(entry.ratePercent))
  const [amount, setAmount] = useState((Math.abs(entry.commissionCents) / 100).toFixed(2))
  const [note, setNote] = useState(entry.overrideNote ?? '')
  const [saving, setSaving] = useState(false)
  const refund = entry.amountCents < 0

  const preview = (() => {
    if (mode === 'reset') return Math.sign(entry.amountCents) * Math.round(Math.abs((entry.amountCents * entry.defaultRatePercent) / 100))
    if (mode === 'rate') {
      const r = Number(rate)
      if (!Number.isFinite(r)) return null
      return Math.sign(entry.amountCents) * Math.round(Math.abs((entry.amountCents * r) / 100))
    }
    const a = Number(amount)
    if (!Number.isFinite(a)) return null
    return (refund ? -1 : 1) * Math.round(a * 100)
  })()

  async function save() {
    setSaving(true)
    try {
      const input: Record<string, unknown> = { id: entry.id, note }
      if (mode === 'rate') input.ratePercent = Number(rate)
      if (mode === 'amount') input.commissionCents = (refund ? -1 : 1) * Math.round(Number(amount) * 100)
      const res = await overrideCommission(input)
      if (!res.ok) return notifyError(res.error)
      notifyDone(mode === 'reset' ? 'Override cleared' : 'Commission updated', `${entry.customerName}: now ${formatUsd(res.entry.commissionCents)} at ${formatRate(res.entry.ratePercent)}.`)
      onSaved()
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Override commission</DialogTitle>
          <DialogDescription>
            {entry.customerName} · {SALE_TYPE_LABEL[entry.saleType]} · {formatUsd(entry.amountCents)} collected on {formatWhen(entry.occurredAt)}. The rep&apos;s default at the time of sale was {formatRate(entry.defaultRatePercent)}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(['rate', 'amount', 'reset'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${mode === m ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
              >
                {m === 'rate' ? 'Set rate' : m === 'amount' ? 'Set amount' : 'Use default'}
              </button>
            ))}
          </div>
          {mode === 'rate' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-rate">Rate (%)</Label>
              <Input id="override-rate" type="number" min={0} max={100} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          ) : null}
          {mode === 'amount' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-amount">Commission {refund ? 'clawback' : 'owed'} ($)</Label>
              <Input id="override-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          ) : null}
          {mode !== 'reset' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-note">Note (optional)</Label>
              <Input id="override-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this entry differs" maxLength={300} />
            </div>
          ) : null}
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            New commission: <strong className="tabular-nums">{preview == null ? '—' : formatUsd(preview)}</strong>
            {mode === 'reset' ? <span className="text-muted-foreground"> at {formatRate(entry.defaultRatePercent)}</span> : null}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || preview == null}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
