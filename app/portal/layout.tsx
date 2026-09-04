import type React from 'react'
import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { PortalNav, SettingsNavLink } from '@/components/portal/portal-nav'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { DemoBarServer } from '@/components/demo/demo-bar-server'

export const metadata = {
  title: 'Reactivation Power — Portal',
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={null}>
        <DemoBarServer />
      </Suspense>
      <header className="border-b border-border bg-card">
        <div
          className={`${PORTAL_WIDTH} flex h-16 items-center justify-between gap-4`}
        >
          <Link href="/portal" className="flex min-w-0 items-center">
            <Image
              src="/images/logo.png"
              alt="Reactivation Power"
              width={1177}
              height={480}
              priority
              className="h-12 w-auto"
            />
            <span className="sr-only">Reactivation Power Portal</span>
          </Link>
          <PortalNav />
          <div className="flex items-center gap-2">
            <SettingsNavLink />
            <form action={logout}>
              <button
                type="submit"
                className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <LogOut className="size-4" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="py-8 text-center text-sm text-muted-foreground">
        Powered by Reactivation Power
      </footer>
    </div>
  )
}
