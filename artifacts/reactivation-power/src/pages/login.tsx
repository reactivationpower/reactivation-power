// @ts-nocheck

import { LoginForm } from '@/components/login-form'
import { useSearch } from 'wouter'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'


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
  const { next } = data

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
