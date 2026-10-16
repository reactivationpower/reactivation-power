// @ts-nocheck
import { Link, useParams } from 'wouter'

import { AgreementSigning } from '@/components/agreements/agreement-signing'
import { PageError, PageLoading } from '@/components/page-status'
import { usePageData } from '@/hooks/use-page-data'
import NotFound from '@/pages/not-found'

/**
 * Public, tokenized agreement page. Shows the signing view until the
 * agreement is completed, then the signed copy with the certificate.
 */
export default function AgreementPage() {
  const { token } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/agreements/${token}`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { agreement } = data

  return (
    <main className="min-h-screen bg-background">
      {agreement.stripe_mode === 'test' ? (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
          Stripe test mode — use a test card (e.g. 4242 4242 4242 4242). No real charges.
        </div>
      ) : null}
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-10">
        <header className="flex flex-col items-center gap-4 text-center">
          <Link href="/">
            <img src="/images/patient-pipeline-logo.png" alt="Patient Pipeline" width={2172} height={724} className="h-12 w-auto" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-balance text-foreground" data-testid="agreement-title">
              {agreement.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepared for {agreement.customer.full_name}
              {agreement.customer.business_name ? ` · ${agreement.customer.business_name}` : ''}
            </p>
          </div>
        </header>

        <AgreementSigning key={agreement.token} token={token} initial={agreement} />

        <p className="text-center text-xs text-muted-foreground">
          Questions? Email {agreement.company.email}. Payments are processed securely by Stripe.
        </p>
      </div>
    </main>
  )
}
