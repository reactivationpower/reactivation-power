// @ts-nocheck
import { useEffect } from 'react'
import { Link, useParams } from 'wouter'
import { ArrowLeft, FileText, Plus, Receipt, Users } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { AgreementCard } from '@/components/admin/agreement-card'
import { CustomerLeadPanel } from '@/components/admin/customer-lead-panel'
import { BillingStatusBadge } from '@/components/admin/billing-panel'
import { StateBadge } from '@/pages/admin_customers'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import NotFound from '@/pages/not-found'

export function formatUsd(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Billing history row: which offer it belongs to, or why it can't be linked. */
export function historyOfferState(row: { link_id?: string | null }, offerIds: Set<string>): { kind: 'live' | 'missing' | 'none'; id?: string } {
  if (!row.link_id) return { kind: 'none' }
  return offerIds.has(row.link_id) ? { kind: 'live', id: row.link_id } : { kind: 'missing', id: row.link_id }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { data, loading, error, notFound, reload } = usePageData<any>(`/admin/customers/${id}`)
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 30000)
    return () => window.clearInterval(timer)
  }, [reload])
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { customer, offers = [], accounts = [], history = [], agreements = [], leads = [], canManageViewers, superAdmin } = data
  const offerIds = new Set(data.liveOfferIds ?? offers.map((o) => o.id))
  const offerAgreementIds = new Set(offers.map((o) => o.agreement?.id).filter(Boolean))
  const pastAgreements = agreements.filter((a) => !offerAgreementIds.has(a.id))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> Customers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {customer.business_name || customer.full_name}
              </h1>
              {customer.billing_status ? <BillingStatusBadge status={customer.billing_status} /> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {customer.full_name} · {customer.email}{customer.phone ? ` · ${customer.phone}` : ''}
            </p>
          </div>
          <Link
            href={`/admin/payments?customer=${customer.id}`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Create another offer
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Practice</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Business">{customer.business_name}</Field>
                <Field label="Contact">{customer.full_name}</Field>
                <Field label="Email">{customer.email ? <a className="hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a> : null}</Field>
                <Field label="Phone">{customer.phone}</Field>
                <div className="sm:col-span-2"><Field label="Business address">{customer.business_address}</Field></div>
                <Field label="Owner">{customer.owner_name}</Field>
                <Field label="Owner phone">{customer.owner_phone}</Field>
                <Field label="Billing issue">{customer.billing_issue}</Field>
                <Field label="Stripe customer"><span className="font-mono text-xs">{customer.stripe_customer_id}</span></Field>
              </dl>
            </CardContent>
          </Card>

          <CustomerLeadPanel leads={leads} superAdmin={superAdmin === true} />

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Offers ({offerIds.size})</h2>
            {offerIds.size > offers.length && <p className="text-sm text-muted-foreground">Showing the latest 100 offers. Older offers can still be opened from their billing history.</p>}
            {offers.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                No live offers. Use Create another offer to start enrollment.
              </CardContent></Card>
            ) : offers.map((o) => (
              <Card key={o.id}>
                <CardContent className="flex flex-col gap-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{o.name} <span className="text-muted-foreground">· {o.type === 'subscription' ? 'Subscription' : 'One-time'}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {o.type === 'subscription'
                          ? `${formatUsd(o.monthly_cents)}/mo · ${o.setup_fee_cents > 0 ? `${formatUsd(o.setup_fee_cents)} setup` : 'setup waived'}`
                          : formatUsd(o.amount_cents)}
                        {o.completed_at ? ` · completed ${formatWhen(o.completed_at)}` : ''}
                      </p>
                    </div>
                    <Link href={`/admin/payments/${o.id}`} className="text-sm font-medium text-primary hover:underline">
                      Continue enrollment
                    </Link>
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-4">
                    <Field label="Offer status"><StateBadge value={o.status} /></Field>
                    <Field label="Enrollment"><StateBadge value={o.stage} /></Field>
                    <Field label="Agreement"><StateBadge value={o.agreement?.status} /></Field>
                    <Field label="Invitation"><StateBadge value={o.invitation_status} /></Field>
                  </dl>
                  {o.agreement_access ? <AgreementCard linkId={o.id} agreement={o.agreement ?? null} offerType={o.type} enrollmentFlow={o.enrollment_flow} /> : <p className="text-sm text-muted-foreground">Agreement access is restricted to its assigned representative and administrators.</p>}
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Receipt className="size-4 text-muted-foreground" /> Billing history</CardTitle>
              <p className="text-sm text-muted-foreground">Read-only. Manage charges from the offer page.</p>
              {history.length === 200 && <p className="text-xs text-muted-foreground">Showing the latest 200 billing events.</p>}
            </CardHeader>
            <CardContent>
              {history.length === 0 ? <p className="text-sm text-muted-foreground">No charges recorded.</p> : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {history.map((h) => {
                    const st = historyOfferState(h, offerIds)
                    return (
                      <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium capitalize">{h.status} · {formatUsd(h.amount_cents)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatWhen(h.occurred_at)}{h.failure_message ? ` · ${h.failure_message}` : ''}
                          </p>
                        </div>
                        {st.kind === 'live' ? (
                          <Link href={`/admin/payments/${st.id}`} className="text-xs text-primary hover:underline">View offer</Link>
                        ) : st.kind === 'missing' ? (
                          <Badge variant="outline">Offer deleted</Badge>
                        ) : (
                          <Badge variant="outline">No offer</Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-muted-foreground" /> Accounts</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {accounts.length === 0 ? <p className="text-sm text-muted-foreground">No portal accounts yet.</p> : accounts.map((a) => {
                const body = (
                  <>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.first_name} {a.last_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant={a.role === 'owner' ? 'default' : 'secondary'}>{a.role === 'owner' ? 'Viewer' : 'Staff'}</Badge>
                      {!a.is_active ? <Badge variant="outline">Disabled</Badge> : null}
                    </div>
                  </>
                )
                const cls = 'flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3'
                return canManageViewers ? (
                  <Link key={a.id} href={`/admin/participants/${a.id}`} className={`${cls} transition-colors hover:bg-accent`}>{body}</Link>
                ) : (
                  <div key={a.id} className={cls}>{body}</div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="size-4 text-muted-foreground" /> Agreements and signed copies</CardTitle></CardHeader>
            <CardContent>
              {agreements.length === 0 ? <p className="text-sm text-muted-foreground">No agreements yet.</p> : (
                <ul className="flex flex-col gap-2">
                  {agreements.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <div>
                        <StateBadge value={a.status} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {a.signed_at ? `Signed ${formatWhen(a.signed_at)}` : 'Not signed'}
                          {pastAgreements.includes(a) && !offerIds.has(a.link_id) ? ' · offer deleted' : ''}
                        </p>
                      </div>
                      {a.can_view ? <Link href={`/admin/agreements/${a.id}`} className="text-xs text-primary hover:underline">
                        {a.signed_at ? 'Signed copy' : 'View'}
                      </Link> : <span className="text-xs text-muted-foreground">Access restricted</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
