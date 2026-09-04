import type { Metadata } from 'next'
import Image from 'next/image'
import { DemoEntryForm } from '@/components/demo/demo-entry-form'
import { DEMO_OWNER } from '@/lib/demo/config'

export const metadata: Metadata = {
  title: 'Sales Demo — Reactivation Power',
  description: 'Password-protected demo of the Reactivation Power client portal.',
  robots: { index: false, follow: false },
}

export default function DemoPage() {
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
            Sales demo &middot; {DEMO_OWNER.practice}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <DemoEntryForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground text-pretty">
          Everything inside is sample data. Nothing you do here affects a real
          account.
        </p>
      </div>
    </main>
  )
}
