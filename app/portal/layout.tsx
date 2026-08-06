import type React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'

export const metadata = {
  title: 'Reactivation Power — Training Portal',
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/portal" className="flex min-w-0 items-center">
            <Image
              src="/images/logo.png"
              alt="Reactivation Power"
              width={1177}
              height={480}
              priority
              className="h-12 w-auto"
            />
            <span className="sr-only">Reactivation Power Training Portal</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Portal">
            <Link
              href="/portal"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Training
            </Link>
            <Link
              href="/portal/reactivation"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Reactivation
            </Link>
          </nav>
          <form action={logout}>
            <button
              type="submit"
              className="flex shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <LogOut className="size-4" />
              Sign Out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="py-8 text-center text-sm text-muted-foreground">
        Powered by Reactivation Power
      </footer>
    </div>
  )
}
