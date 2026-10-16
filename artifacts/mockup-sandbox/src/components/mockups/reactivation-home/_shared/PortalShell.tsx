import type { MouseEvent, ReactNode } from 'react'
import {
  BarChart3,
  CreditCard,
  GraduationCap,
  LogOut,
  PhoneCall,
  Settings,
  Users,
} from 'lucide-react'

import '../_group.css'

const PORTAL_WIDTH = 'mx-auto w-full max-w-[1440px] px-6'

const NAV = [
  { href: '/portal/contacts', label: 'Contacts', icon: Users },
  { href: '/portal', label: 'Training', icon: GraduationCap },
  { href: '/portal/dialer', label: 'Dialer', icon: PhoneCall },
  { href: '/portal/analytics', label: 'Analytics', icon: BarChart3 },
] as const

// The canvas snapshot is deliberately disconnected from authentication and routing.
const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()

export function PortalShell({
  children,
  trainingActive = true,
}: {
  children: ReactNode
  trainingActive?: boolean
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div
          className={`${PORTAL_WIDTH} flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 lg:h-16 lg:flex-nowrap lg:py-0`}
        >
          <a href="/portal" onClick={preventNavigation} className="flex min-w-0 items-center">
            <img
              src="/__mockup/images/logo.png"
              alt="Reactivation Power"
              width={1177}
              height={480}
              className="h-12 w-auto"
            />
            <span className="sr-only">Reactivation Power Portal</span>
          </a>
          <nav className="order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:px-0" aria-label="Portal">
            {NAV.map((item) => {
              const active = item.href === '/portal' && trainingActive
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={preventNavigation}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </a>
              )
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-2 lg:order-last">
            <a
              href="/portal/billing"
              onClick={preventNavigation}
              aria-label="Billing"
              data-testid="nav-billing"
              className="flex size-10 items-center justify-center rounded-md border border-input transition-colors bg-card text-foreground hover:bg-muted"
            >
              <CreditCard className="size-4" />
            </a>
            <a
              href="/portal/settings"
              onClick={preventNavigation}
              aria-label="Settings"
              className="flex size-10 items-center justify-center rounded-md border border-input transition-colors bg-card text-foreground hover:bg-muted"
            >
              <Settings className="size-4" />
            </a>
            <button
              type="button"
              className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <LogOut className="size-4" />
              Sign Out
            </button>
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