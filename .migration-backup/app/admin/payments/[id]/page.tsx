import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone } from 'lucide-react'

import { getPaymentDetail } from '@/app/actions/payments'
import { PaymentDetailActions } from '@/components/admin/payment-detail-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Payment | Admin',
}

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

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getPaymentDetail(id)
  if (!detail) notFound()

  const { link, accounts } = detail
  const isPaid = link.status === 'paid'
  const owner = accounts.find((a) => a.role === 'owner')
  const staffAccounts = accounts.filter((a) => a.role === 'staff')

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/payments"
          className="mb-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Payments
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {link.name}
              </h1>
              <Badge variant={isPaid ? 'default' : 'secondary'}>
                {isPaid ? 'Paid' : 'Pending'}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-4" />
                {link.email}
              </span>
              {link.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4" />
                  {link.phone}
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tracking-tight">
              {formatUsd(link.amount_cents)}
            </p>
            <p className="text-sm text-muted-foreground">
              Reactivation Power Access
            </p>
          </div>
        </div>
      </div>

      <PaymentDetailActions link={link} hasAccounts={accounts.length > 0} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">Link created</dt>
                <dd className="font-medium">{formatWhen(link.created_at)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">Payment received</dt>
                <dd className="font-medium">
                  {isPaid ? formatWhen(link.paid_at) : 'Not yet paid'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Accounts created</dt>
                <dd className="font-medium">
                  {link.provisioned_at
                    ? formatWhen(link.provisioned_at)
                    : 'Not yet'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Staff on the order */}
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
              <ul className="flex flex-col gap-2">
                {link.staff.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-2.5"
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

      {/* Portal accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portal accounts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Created automatically when the payment completed. The buyer becomes
            a viewer; staff sit underneath and inherit their access.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isPaid
                ? 'No accounts yet — use "Create accounts now" above to retry.'
                : 'Accounts are created once this payment is completed.'}
            </p>
          ) : (
            <>
              {owner ? (
                <AccountRow account={owner} />
              ) : null}
              {staffAccounts.map((a) => (
                <AccountRow key={a.id} account={a} nested />
              ))}
            </>
          )}
        </CardContent>
      </Card>
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
