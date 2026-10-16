import type React from 'react'
import { Suspense } from 'react'

import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { BillingNavLink, PortalHomeLink, PortalNav, SettingsNavLink } from '@/components/portal/portal-nav'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { DemoBarServer } from '@/components/demo/demo-bar-server'
import { ViewAsBanner } from '@/components/portal/view-as-banner'
import { AuthenticatedSession } from '@/components/authenticated-session'


export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedSession kind="portal"><PortalContent>{children}</PortalContent></AuthenticatedSession>
}

function PortalContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ViewAsBanner />
      <Suspense fallback={null}>
        <DemoBarServer />
      </Suspense>
      <header className="border-b border-border bg-card">
        <div
          className={`${PORTAL_WIDTH} flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 lg:h-16 lg:flex-nowrap lg:py-0`}
        >
          <PortalHomeLink>
            <img
              src="/images/patient-pipeline-logo.png"
              alt="Patient Pipeline"
              width={2172}
              height={724}
              className="h-12 w-auto"
            />
            <span className="sr-only">Patient Pipeline Portal</span>
          </PortalHomeLink>
          <PortalNav />
          <div className="flex shrink-0 items-center gap-2 lg:order-last">
            <BillingNavLink />
            <SettingsNavLink />
            <form onSubmit={async (e) => {
              e.preventDefault();
              await logout();
            }}>
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
