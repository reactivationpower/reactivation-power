// @ts-nocheck
import { Link, useParams } from 'wouter'
import {
  ArrowLeft,
  Check,
  CircleDashed,
  ExternalLink,
  Link2,
  Users,
} from 'lucide-react'

import { PaymentDetailActions } from '@/components/admin/payment-detail-actions'
import { StatusPill } from '@/components/admin/payments-manager'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'


function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function Field({
  label,
  children,
  mono = false,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`text-sm text-foreground ${mono ? 'font-mono text-xs' : ''}`}>
        {children}
      </dd>
    </div>
  )
}

export default function PaymentDetailPage() {
  const params = useParams()

  const { id } = params
  const { data, loading, error, notFound } = usePageData<any>(
    `/admin/payments/${id}`,
  )
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { link, accounts, isPaid, owner, staffAccounts } = data

  const activity: {
    label: string
    at: string | null
    done: boolean
    detail?: string
  }[] = [
    {
      label: 'Payment link created',
      at: link.created_at,
      done: true,
      detail: `${formatUsd(link.amount_cents)} · Reactivation Power Access`,
    },
    {
      label: isPaid ? 'Payment received' : 'Awaiting payment',
      at: isPaid ? link.paid_at : null,
      done: isPaid,
      detail: isPaid ? formatUsd(link.amount_cents) : 'Link is still open',
    },
    {
      label: link.provisioned_at
        ? 'Portal accounts created'
        : 'Portal accounts pending',
      at: link.provisioned_at,
      done: Boolean(link.provisioned_at),
      detail: link.provisioned_at
        ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}`
        : isPaid
          ? 'Use "Create accounts now" to provision'
          : 'Created automatically after payment',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <Link
          href="/admin/payments"
          className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Payments
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {link.name}
              </h1>
              <StatusPill status={link.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {link.email}
              {link.phone ? ` · ${link.phone}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatUsd(link.amount_cents)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPaid ? `Paid ${formatWhen(link.paid_at)}` : 'Not yet paid'}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <PaymentDetailActions link={link} hasAccounts={accounts.length > 0} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── Left column: record ─────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">{link.name}</Field>
                <Field label="Email">
                  <a
                    href={`mailto:${link.email}`}
                    className="hover:underline"
                  >
                    {link.email}
                  </a>
                </Field>
                <Field label="Phone">
                  {link.phone ? (
                    <a href={`tel:${link.phone}`} className="hover:underline">
                      {link.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Field>
                <Field label="Business">
                  <span className="text-muted-foreground">—</span>
                </Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Product">Reactivation Power Access</Field>
                <Field label="Amount">
                  <span className="font-medium tabular-nums">
                    {formatUsd(link.amount_cents)}
                  </span>
                </Field>
                <Field label="Status">
                  <StatusPill status={link.status} />
                </Field>
                <Field label="Payment date">{formatWhen(link.paid_at)}</Field>
                <div className="sm:col-span-2">
                  <Field label="Payment link">
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <a
                        href={`/pay/${link.token}`}
                        target="_blank"
                        rel="noopener"
                        className="truncate font-mono text-xs hover:underline"
                      >
                        /pay/{link.token}
                      </a>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </span>
                  </Field>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Staff on this order ({link.staff.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {link.staff.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No staff members were added to this order.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {link.staff.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        {s.name || '—'}
                      </span>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {s.email || 'No email'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: accounts + activity ───────────────── */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-muted-foreground" />
                Portal accounts
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                The buyer is the viewer; staff sit underneath and inherit their
                access.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isPaid
                    ? 'No accounts yet — use "Create accounts now" above to retry.'
                    : 'Accounts are created once this payment is completed.'}
                </p>
              ) : (
                <>
                  {owner ? <AccountRow account={owner} /> : null}
                  {staffAccounts.map((a) => (
                    <AccountRow key={a.id} account={a} nested />
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col">
                {activity.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                          item.done
                            ? 'bg-success/15 text-success'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {item.done ? (
                          <Check className="size-3" />
                        ) : (
                          <CircleDashed className="size-3" />
                        )}
                      </span>
                      {i < activity.length - 1 ? (
                        <span className="my-1 w-px flex-1 bg-border" />
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col pb-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={`text-sm font-medium ${
                            item.done ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.at ? formatWhen(item.at) : ''}
                        </span>
                      </div>
                      {item.detail ? (
                        <span className="text-xs text-muted-foreground">
                          {item.detail}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AccountRow({
  account,
  nested = false,
}: {
  account: {
    id: string
    first_name: string
    last_name: string
    email: string
    role: 'owner' | 'staff'
    is_active: boolean
  }
  nested?: boolean
}) {
  return (
    <Link
      href={`/admin/participants/${account.id}`}
      className={`flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 transition-colors hover:bg-accent ${
        nested ? 'ml-6' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {account.first_name} {account.last_name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {account.email}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={account.role === 'owner' ? 'default' : 'secondary'}>
          {account.role === 'owner' ? 'Viewer' : 'Staff'}
        </Badge>
        {!account.is_active ? <Badge variant="outline">Disabled</Badge> : null}
      </div>
    </Link>
  )
}
