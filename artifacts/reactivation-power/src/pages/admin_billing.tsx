// @ts-nocheck
import { Link, useSearch } from 'wouter'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { useRouter } from '@/hooks/use-router'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { BillingStatusBadge } from '@/components/admin/billing-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function formatDay(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })
}
function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
function dayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  return dayString(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => daysAgo(0) },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => daysAgo(0) },
  {
    label: 'This month',
    from: () => `${dayString(new Date()).slice(0, 7)}-01`,
    to: () => daysAgo(0),
  },
  { label: 'Last 90 days', from: () => daysAgo(89), to: () => daysAgo(0) },
]

const SUB_STATUS: Record<string, string> = {
  active: 'Active',
  trialing: 'First month',
  past_due: 'Past due',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
  incomplete: 'Incomplete',
}

function CardChips({ cards }: { cards: any[] }) {
  if (!cards.length) return <span className="text-xs text-muted-foreground">No cards</span>
  return (
    <div className="flex flex-wrap gap-1">
      {cards.map((c) => (
        <Badge key={`${c.rank}-${c.last4}`} variant={c.rank === "primary" ? "default" : "secondary"} className="font-normal capitalize">
          {c.rank === 'primary' ? 'Primary' : 'Backup'} · {c.brand} ····{c.last4}
        </Badge>
      ))}
    </div>
  )
}

/** Failed/upcoming rows carry customer_id; customer rows (customers/pastDue) use id. */
export function customerIdFor(row: { customer_id?: string | null; id?: string | null }, kind: 'ledger' | 'customer'): string | null {
  return (kind === 'ledger' ? row.customer_id : row.id) ?? null
}

function CustomerLink({ row, kind, children }: { row: any; kind: 'ledger' | 'customer'; children: React.ReactNode }) {
  const cid = customerIdFor(row, kind)
  if (!cid) return <span className="text-sm font-medium">{children}</span>
  return (
    <Link href={`/admin/customers/${cid}`} className="text-sm font-medium text-primary hover:underline">
      {children}
    </Link>
  )
}

export default function BillingDashboardPage() {
  const router = useRouter()
  const searchParams = new URLSearchParams(useSearch())
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const { data, loading, error } = usePageData<any>('/admin/billing', { from, to })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { metrics: m, upcoming, failed, pastDue, customers, range, upcomingDays, stripeMode } = data

  function setRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams()
    if (nextFrom) params.set('from', nextFrom)
    if (nextTo) params.set('to', nextTo)
    router.replace(`/admin/billing?${params.toString()}`)
  }
  const activePreset = PRESETS.find((p) => p.from() === range.from && p.to() === range.to)?.label

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Insights</p>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-muted-foreground">
            Cash collected, recurring revenue, failed payments and what is due next — every
            customer links to its billing record
          </p>
        </div>
        {stripeMode === 'test' ? <Badge variant="outline">Stripe test mode</Badge> : null}
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2" data-testid="billing-range">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={activePreset === p.label ? 'default' : 'outline'}
            onClick={() => setRange(p.from(), p.to())}
          >
            {p.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Input
            type="date"
            aria-label="From"
            className="h-8 w-40"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange(e.target.value, range.to)}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            className="h-8 w-40"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && setRange(range.from, e.target.value)}
          />
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          testId="metric-collected"
          label="Cash collected"
          value={formatUsd(m.collected_cents)}
          hint={
            m.refunded_cents > 0
              ? `${formatUsd(m.gross_cents)} charged · ${formatUsd(m.refunded_cents)} refunded`
              : 'Net of refunds, selected range'
          }
        />
        <StatCard
          testId="metric-mrr"
          label="MRR"
          value={formatUsd(m.mrr_cents)}
          hint={`${m.mrr_subscriptions} live subscription${m.mrr_subscriptions === 1 ? '' : 's'} · right now`}
        />
        <StatCard
          testId="metric-outstanding"
          label="Outstanding"
          value={formatUsd(m.outstanding_cents)}
          hint={`${m.outstanding_customers} customer${m.outstanding_customers === 1 ? '' : 's'} with unpaid invoices`}
          tone={m.outstanding_cents > 0 ? 'warn' : undefined}
        />
        <StatCard
          testId="metric-failed"
          label="Failed payments"
          value={String(m.failed_count)}
          hint={`${formatUsd(m.failed_cents)} across ${m.failed_customers} customer${m.failed_customers === 1 ? '' : 's'}`}
          tone={m.failed_count > 0 ? 'warn' : undefined}
        />
        <StatCard
          testId="metric-collected-count"
          label="Payments collected"
          value={String(m.collected_count)}
          hint={m.refund_count > 0 ? `${m.refund_count} refund${m.refund_count === 1 ? '' : 's'} in range` : 'Successful charges in range'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Upcoming payments */}
        <section className="flex flex-col gap-3" data-testid="upcoming-payments">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <CalendarClock className="size-5 text-primary" /> Upcoming payments
              </h2>
              <p className="text-sm text-muted-foreground">
                Next {upcomingDays} days · {formatUsd(m.upcoming_cents)} across {m.upcoming_count} renewal{m.upcoming_count === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              {upcoming.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No renewals due in the next {upcomingDays} days.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Due</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((u) => (
                      <TableRow key={u.link_id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDay(u.due_at)}</TableCell>
                        <TableCell>
                          <CustomerLink row={u} kind="ledger">{u.customer_name}</CustomerLink>
                          <p className="text-xs text-muted-foreground">{u.business_name}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="capitalize">{u.card ? `${u.card.brand} ····${u.card.last4}` : "No card"}</span>
                          {u.subscription_status === 'past_due' ? (
                            <Badge variant="destructive" className="ml-2">Past due</Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatUsd(u.amount_cents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Past due customers */}
        <section className="flex flex-col gap-3" data-testid="past-due-customers">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <AlertTriangle className="size-5 text-destructive" /> Past due
            </h2>
            <p className="text-sm text-muted-foreground">
              {m.past_due_customers} customer{m.past_due_customers === 1 ? '' : 's'} with access paused · {formatUsd(m.outstanding_cents)} outstanding
            </p>
          </div>
          <Card>
            <CardContent className="p-0">
              {pastDue.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No customers are past due.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last decline</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastDue.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <CustomerLink row={c} kind="customer">{c.full_name}</CustomerLink>
                          <p className="text-xs text-muted-foreground">{c.business_name}</p>
                        </TableCell>
                        <TableCell><BillingStatusBadge status={c.billing_status} /></TableCell>
                        <TableCell className="max-w-56 text-xs text-muted-foreground">
                          <p>{formatWhen(c.last_failed_at)}</p>
                          {c.last_failure_message ? <p className="truncate">{c.last_failure_message}</p> : null}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatUsd(c.outstanding_cents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Failed payments in range */}
      <section className="flex flex-col gap-3" data-testid="failed-payments">
        <div>
          <h2 className="text-xl font-semibold">Failed payments</h2>
          <p className="text-sm text-muted-foreground">
            Every declined charge in the selected range, including ones the backup card later recovered
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            {failed.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No failed payments in this range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failed.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatWhen(f.occurred_at)}</TableCell>
                      <TableCell>
                        <CustomerLink row={f} kind="ledger">{f.customer_name}</CustomerLink>
                        <p className="text-xs text-muted-foreground">{f.business_name}</p>
                      </TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">
                        {f.card_last4 ? `${f.card_rank === 'secondary' ? 'Backup' : 'Primary'} · ${f.card_brand} ····${f.card_last4}` : '—'}
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-xs text-muted-foreground">{f.failure_message ?? '—'}</TableCell>
                      <TableCell>
                        {f.recovered ? <Badge variant="secondary">Recovered</Badge> : <Badge variant="destructive">Unpaid</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatUsd(f.amount_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* All customers */}
      <section className="flex flex-col gap-3" data-testid="billing-customers">
        <div>
          <h2 className="text-xl font-semibold">Customers</h2>
          <p className="text-sm text-muted-foreground">
            {customers.length} customer{customers.length === 1 ? '' : 's'} · {m.active_customers} active · subscription status, cards on file and lifetime cash
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            {customers.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No customers yet — customers appear once a payment link is created.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Next payment</TableHead>
                    <TableHead>Cards on file</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <CustomerLink row={c} kind="customer">{c.full_name}</CustomerLink>
                        <p className="text-xs text-muted-foreground">{c.business_name || c.email}</p>
                      </TableCell>
                      <TableCell><BillingStatusBadge status={c.billing_status} /></TableCell>
                      <TableCell className="text-sm">
                        {c.plan === 'subscription' ? (
                          <>
                            {formatUsd(c.monthly_cents)}/mo
                            {c.subscription_status ? (
                              <span className="text-xs text-muted-foreground"> · {SUB_STATUS[c.subscription_status] ?? c.subscription_status}</span>
                            ) : null}
                          </>
                        ) : c.plan === 'one_time' ? 'One-time' : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.plan === 'subscription' && c.subscription_status && c.subscription_status !== 'canceled' ? formatDay(c.next_payment_at) : '—'}
                        {c.cancel_at ? <p className="text-xs text-muted-foreground">Cancels {formatDay(c.cancel_at)}</p> : null}
                      </TableCell>
                      <TableCell><CardChips cards={c.cards} /></TableCell>
                      <TableCell className="text-right font-medium">
                        {formatUsd(c.collected_cents)}
                        {c.outstanding_cents > 0 ? (
                          <p className="text-xs text-destructive">{formatUsd(c.outstanding_cents)} owed</p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone,
  testId,
}: {
  label: string
  value: string
  hint: string
  tone?: 'warn'
  testId?: string
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-semibold ${tone === 'warn' ? 'text-destructive' : 'text-primary'}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
