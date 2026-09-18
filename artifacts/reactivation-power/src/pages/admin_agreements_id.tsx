// @ts-nocheck
import { Link, useParams } from 'wouter'
import { ArrowLeft, History, ListChecks } from 'lucide-react'

import { AgreementActions } from '@/components/admin/agreement-actions'
import {
  AgreementDocument,
  AgreementStatusPill,
  AgreementTermsBox,
  CertificateView,
  SignedBlock,
  formatUsd,
  formatWhen,
} from '@/components/agreements/agreement-document'
import { PageError, PageLoading } from '@/components/page-status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePageData } from '@/hooks/use-page-data'
import NotFound from '@/pages/not-found'

const EVENT_LABEL: Record<string, string> = {
  created: 'Created',
  sent: 'Sent',
  resent: 'Re-sent',
  edited: 'Edited',
  viewed: 'Viewed by customer',
  initialed: 'Section initialed',
  consented: 'E-sign consent',
  signed: 'Signed',
  setup_fee_paid: 'Setup fee paid',
  payment_failed: 'Payment failed',
  subscription_started: 'Subscription started',
  completed: 'Completed',
  pdf_generated: 'PDF generated',
  expired: 'Expired',
}

export default function AdminAgreementDetailPage() {
  const { id } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/admin/agreements/${id}`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { detail } = data
  const a = detail.agreement
  const doc = detail.document

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/agreements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All agreements
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-semibold text-foreground">
              {a.customer_name}
              <AgreementStatusPill status={a.status} />
            </h1>
            <p className="text-sm text-muted-foreground">
              {a.business_name} · {a.email} ·{' '}
              <Link href={`/admin/payments/${a.link_id}`} className="underline">
                customer record
              </Link>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Version {a.current_version} · sent by {a.rep_name ?? '—'} {formatWhen(a.sent_at)}
              {a.signed_at ? ` · signed ${formatWhen(a.signed_at)}` : a.expires_at ? ` · link valid until ${formatWhen(a.expires_at)}` : ''}
            </p>
          </div>
          <AgreementActions agreement={a} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <AgreementTermsBox
            amounts={{ term_months: a.term_months, monthly_cents: a.monthly_cents, setup_fee_cents: a.setup_fee_cents, notice_days: detail.notice_days }}
            fields={doc.fields}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{doc.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <AgreementDocument sections={doc.sections} initials={detail.initials} readOnly />
            </CardContent>
          </Card>
          {detail.signature ? <SignedBlock signature={detail.signature} businessName={a.business_name} /> : null}
          {detail.certificate ? <CertificateView certificate={detail.certificate} /> : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Versions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="divide-y divide-border text-sm" data-testid="ag-versions">
                {detail.versions.map((v: any) => (
                  <li key={v.version} className="py-2">
                    <p className="font-medium text-foreground">
                      v{v.version} · {v.term_months} mo · {formatUsd(v.monthly_cents)}/mo · {v.setup_fee_cents > 0 ? `${formatUsd(v.setup_fee_cents)} setup` : 'setup waived'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.change_summary} · {v.changed_by_name ?? 'system'} · {formatWhen(v.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4" /> Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="divide-y divide-border text-sm" data-testid="ag-events">
                {detail.events.map((e: any) => (
                  <li key={e.id} className="py-2">
                    <p className="font-medium text-foreground">
                      {EVENT_LABEL[e.type] ?? e.type}
                      {e.version ? <span className="ml-1 text-xs text-muted-foreground">v{e.version}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(e.created_at)} · {e.actor_name ?? e.actor}
                      {e.ip ? ` · ${e.ip}` : ''}
                    </p>
                    {e.detail ? (
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(e.detail)
                          .filter(([, v]) => v != null && typeof v !== 'object')
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    ) : null}
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
