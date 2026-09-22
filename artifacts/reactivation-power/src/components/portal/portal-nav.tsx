// @ts-nocheck

import { Link } from "wouter";
import { useLocation, useParams } from "wouter";
import {
  BarChart3,
  CreditCard,
  GraduationCap,
  PhoneCall,
  Settings,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/portal/contacts', label: 'Contacts', icon: Users },
  { href: '/portal', label: 'Training', icon: GraduationCap, exact: true },
  { href: '/portal/dialer', label: 'Dialer', icon: PhoneCall },
  { href: '/portal/analytics', label: 'Analytics', icon: BarChart3 },
] as const

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href || pathname.startsWith('/portal/course')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PortalNav() {
  const [pathname] = useLocation();
  return (
    <nav className="flex items-center gap-1" aria-label="Portal">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, 'exact' in item)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted',
            )}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function SettingsNavLink() {
  const [pathname] = useLocation();
  const active = pathname.startsWith('/portal/settings')
  return (
    <Link
      href="/portal/settings"
      aria-label="Settings"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex size-10 items-center justify-center rounded-md border border-input transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-foreground hover:bg-muted',
      )}
    >
      <Settings className="size-4" />
    </Link>
  )
}

export function BillingNavLink() {
  const [pathname] = useLocation();
  const active = pathname.startsWith('/portal/billing')
  return (
    <Link
      href="/portal/billing"
      aria-label="Billing"
      aria-current={active ? 'page' : undefined}
      data-testid="nav-billing"
      className={cn(
        'flex size-10 items-center justify-center rounded-md border border-input transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-foreground hover:bg-muted',
      )}
    >
      <CreditCard className="size-4" />
    </Link>
  )
}
