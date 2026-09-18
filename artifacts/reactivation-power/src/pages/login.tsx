// @ts-nocheck

import { LoginForm } from '@/components/login-form'
import { useSearch } from 'wouter'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { BillingNotice } from '@/components/billing-notice'


export default function LoginPage() {
  const search = new URLSearchParams(useSearch())
  const requestedNext = search.get('next') ?? undefined
  // Welcome emails link here with the account email prefilled.
  const prefillEmail = search.get('email') ?? undefined
  const { data, loading, error } = usePageData<any>('/login', {
    next: requestedNext,
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { next, billing } = data
  // Portal loaders send a shut-off account here with ?reason=billing; the
  // loader also reports the block when the session cookie was still present.
  const billingNotice = billing ?? (search.get('reason') === 'billing' ? { reason: null, email: prefillEmail ?? null } : null)

  return (
    <main className="flex min-h-svh items-center justify-center bg-card px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/images/logo-slogan.png"
            alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
            width={1183}
            height={578}
            className="h-auto w-full max-w-xs sm:max-w-sm"
          />
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Sign in with your registered email to access your courses.
          </p>
        </div>
        {billingNotice ? (
          <div className="mb-4">
            <BillingNotice reason={billingNotice.reason} email={billingNotice.email ?? prefillEmail ?? null} />
          </div>
        ) : null}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <LoginForm next={next} email={prefillEmail} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground text-pretty">
          Don&apos;t have access? Contact your administrator to be added.
        </p>
      </div>
    </main>
  )
}
