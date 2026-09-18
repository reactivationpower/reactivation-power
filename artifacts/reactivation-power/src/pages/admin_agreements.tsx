// @ts-nocheck
import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { FilePenLine, Search } from 'lucide-react'

import { AgreementStatusPill, STATUS_LABEL, formatUsd, formatWhen } from '@/components/agreements/agreement-document'
import { PageError, PageLoading } from '@/components/page-status'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePageData } from '@/hooks/use-page-data'

const STATUSES = ['draft', 'sent', 'viewed', 'signed', 'payment_pending', 'completed', 'expired']

export default function AdminAgreementsPage() {
  const { data, loading, error } = usePageData<any>('/admin/agreements')
  const [status, setStatus] = useState<string>(data?.status || 'all')
  const [rep, setRep] = useState<string>('all')
  const [q, setQ] = useState('')

  const agreements: any[] = data?.agreements ?? []
  const reps = useMemo(() => [...new Set(agreements.map((a) => a.rep_name).filter(Boolean))].sort(), [agreements])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return agreements.filter(
      (a) =>
        (status === 'all' || a.status === status) &&
        (rep === 'all' || a.rep_name === rep) &&
        (!needle || a.customer_name.toLowerCase().includes(needle) || a.business_name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)),
    )
  }, [agreements, status, rep, q])

  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />

  return (
    <div className="flex h-full flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Agreements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every service agreement sent from a customer record: who it went to, who sent it, the amounts and where it stands.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, business or email" className="pl-8" data-testid="ag-search" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="ag-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rep} onValueChange={setRep}>
          <SelectTrigger className="w-44" data-testid="ag-rep-filter">
            <SelectValue placeholder="Rep" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            {reps.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.length} of {agreements.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <FilePenLine className="size-8 text-muted-foreground" />
          <p className="font-medium text-foreground">No agreements{agreements.length ? ' match these filters' : ' yet'}</p>
          <p className="text-sm text-muted-foreground">
            Send one from a customer's subscription record under <Link href="/admin/payments" className="underline">Payments</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead className="text-right">Setup</TableHead>
                <TableHead className="text-right">Term</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" data-testid={`ag-row-${a.id}`}>
                  <TableCell>
                    <Link href={`/admin/agreements/${a.id}`} className="block">
                      <span className="font-medium text-foreground">{a.customer_name}</span>
                      <span className="block text-xs text-muted-foreground">{a.business_name || a.email}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{a.rep_name ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm">{formatUsd(a.monthly_cents)}</TableCell>
                  <TableCell className="text-right text-sm">{a.setup_fee_cents > 0 ? formatUsd(a.setup_fee_cents) : 'Waived'}</TableCell>
                  <TableCell className="text-right text-sm">{a.term_months} mo</TableCell>
                  <TableCell>
                    <AgreementStatusPill status={a.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatWhen(a.sent_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatWhen(a.signed_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatWhen(a.last_activity_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
