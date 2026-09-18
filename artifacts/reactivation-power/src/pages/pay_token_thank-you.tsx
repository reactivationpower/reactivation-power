// @ts-nocheck
import { useParams } from 'wouter';

import { Link } from "wouter";
import { CheckCircle2 } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'



function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'})
}

export default function ThankYouPage() {
  const params = useParams();

  const { token } = params
  const { data, loading, error, notFound } = usePageData<any>(
    `/pay/${token}/thank-you`,
  )
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { link } = data

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-16 text-center">
        <Link href="/">
          <img
            src="/images/logo.png"
            alt="Reactivation Power"
            width={1177}
            height={480}
            className="h-12 w-auto"
          />
        </Link>

        <CheckCircle2 className="size-14 text-success" aria-hidden="true" />

        <div>
          <h1 className="text-3xl font-semibold text-balance text-foreground">
            Payment received — welcome aboard!
          </h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Thank you, {link.name}. Your payment of{' '}
            <span className="font-semibold text-foreground">
              {formatUsd(link.amountCents)}
            </span>{' '}
            for Reactivation Power Access has been processed successfully.
          </p>
        </div>

        <div className="w-full rounded-lg border border-border bg-card p-5 text-left">
          <h2 className="text-sm font-semibold text-foreground">
            What happens next
          </h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              A receipt from Stripe is on its way to your email inbox.
            </li>
            <li>
              Our team will reach out shortly to set up your account and get
              your team access to the program.
            </li>
            <li>
              Questions in the meantime? Just reply to any email from us and
              we&apos;ll take care of you.
            </li>
          </ul>
        </div>
      </div>
    </main>
  )
}
