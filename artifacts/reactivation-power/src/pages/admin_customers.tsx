// @ts-nocheck
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { Building2, Search } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { BillingStatusBadge } from '@/components/admin/billing-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function StateBadge({ value, empty = 'None' }: { value: string | null | undefined; empty?: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">{empty}</span>
  const good = ['signed', 'completed', 'enrolled', 'active', 'accepted'].includes(value)
  return <Badge variant={good ? 'default' : 'outline'} className="capitalize">{value.replace(/_/g, ' ')}</Badge>
}

export default function CustomersPage() {
  const [, navigate] = useLocation()
  const params = new URLSearchParams(useSearch())
  const q = params.get('q') ?? ''
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get('page') ?? '1', 10) || 1))
  const [draft, setDraft] = useState(q)
  useEffect(() => setDraft(q), [q])
  const { data, loading, error } = usePageData<any>('/admin/customers', { q: q || undefined, page: String(page) })

  const go = (nq: string, np: number) => {
    const sp = new URLSearchParams()
    if (nq) sp.set('q', nq)
    if (np > 1) sp.set('page', String(np))
    const s = sp.toString()
    navigate(`/admin/customers${s ? `?${s}` : ''}`)
  }

  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 50
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const customers = data?.customers ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One record per practice. Enrollment, agreement and billing tracked separately.
          </p>
        </div>
        <form
          className="flex w-full max-w-md items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); go(draft.trim(), 1) }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Name, email, business or phone"
              className="pl-8"
              aria-label="Search customers"
            />
          </div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </div>

      {loading && !data ? <PageLoading /> : error ? <PageError error={error} /> : (
        <Card>
          <CardContent className="p-0">
            {customers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <Building2 className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">{q ? `No customers match "${q}"` : 'No customers yet'}</p>
                <p className="text-xs text-muted-foreground">Customers appear once an offer is created for a practice.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Offers</TableHead>
                    <TableHead>Enrollment</TableHead>
                    <TableHead>Agreement</TableHead>
                    <TableHead>Billing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/admin/customers/${c.id}`} className="text-sm font-medium text-primary hover:underline">
                          {c.business_name || c.full_name || c.email}
                        </Link>
                        {c.business_name ? <p className="text-xs text-muted-foreground">{c.full_name}</p> : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <p>{c.email}</p>
                        {c.phone ? <p>{c.phone}</p> : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{c.offer_count ?? 0}</TableCell>
                      <TableCell><StateBadge value={c.enrollment_status} /></TableCell>
                      <TableCell><StateBadge value={c.agreement_status} /></TableCell>
                      <TableCell>{c.billing_status ? <BillingStatusBadge status={c.billing_status} /> : <StateBadge value={null} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} customer{total === 1 ? '' : 's'} · page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(q, page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(q, page + 1)}>Next</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
