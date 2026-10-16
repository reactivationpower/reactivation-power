// @ts-nocheck

import { LoginForm } from '@/components/login-form'
import { useSearch } from 'wouter'
import { useEffect, useState } from 'react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { BillingNotice } from '@/components/billing-notice'


export default function LoginPage() {
  const search = new URLSearchParams(useSearch())
  const [setupToken] = useState(search.get('setup') ?? undefined)
  useEffect(() => {
    if (!setupToken) return
    const url = new URL(window.location.href)
    url.searchParams.delete('setup')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [setupToken])
  const requestedNext = search.get('next') ?? undefined
  // Welcome emails link here with the account email prefilled.
  const prefillEmail = search.get('email') ?? undefined
  // The "account active" email opens the password setup step directly.
  const startSetup = search.get('start') === 'setup'
  const { data, loading, error } = usePageData<any>('/login', {
    next: requestedNext,
    reason: search.get('reason') ?? undefined,
    session: search.get('session') ?? undefined,
    // The loader only needs to know this is a password-link visit. Never put
    // the one-time secret into API URLs or HTTP access logs.
    setup: setupToken ? '1' : undefined,
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { next, billing, pendingLogin } = data
  // Portal loaders send a shut-off account here with ?reason=billing; the
  // loader also reports the block when the session cookie was still present.
  const billingNotice = billing ?? (search.get('reason') === 'billing' ? { reason: null, email: prefillEmail ?? null } : null)

  return (
    <main className="flex min-h-svh items-center justify-center bg-card px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
            className="h-auto w-full max-w-xs sm:max-w-sm"
          />
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Sign in with your email, password, and a single-use email code. After that, this computer won&apos;t need a code for 2 days.
          </p>
        </div>
        {billingNotice ? (
          <div className="mb-4">
            <BillingNotice reason={billingNotice.reason} email={billingNotice.email ?? prefillEmail ?? null} />
          </div>
        ) : null}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {search.get('reason') === 'inactivity' && (
            <p role="status" className="mb-4 text-sm text-muted-foreground">You were signed out after 30 minutes of inactivity. Please sign in again.</p>
          )}
          <LoginForm next={next} email={prefillEmail} setupToken={setupToken} pendingLogin={pendingLogin} startSetup={startSetup} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground text-pretty">
          Don&apos;t have access? Contact your administrator to be added.
        </p>
      </div>
    </main>
  )
}
