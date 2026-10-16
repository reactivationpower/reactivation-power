import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: 'Client Login — Reactivation Power',
  description: 'Sign in to access your training courses.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await getSession()
  if (session) redirect('/portal')
  const { next } = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center bg-card px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/images/logo-slogan.png"
            alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
            width={1183}
            height={578}
            priority
            className="h-auto w-full max-w-xs sm:max-w-sm"
          />
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Sign in with your registered email to access your courses.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground text-pretty">
          Don&apos;t have access? Contact your administrator to be added.
        </p>
      </div>
    </main>
  )
}
