// @ts-nocheck

import { Link } from "wouter";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  GraduationCap,
  Megaphone,
  Inbox,
  PhoneCall,
  Settings,
  Users,
} from 'lucide-react'
import { PRODUCT_HOME, PRODUCT_LABELS, productForPath } from '@workspace/shared/lead-followup'
import { cn } from '@/lib/utils'
import { usePageData } from '@/hooks/use-page-data'

const NAV = [
  { href: '/portal/contacts', label: 'Contacts', icon: Users },
  { href: '/portal/training', label: 'Training', icon: GraduationCap, exact: true },
  { href: '/portal/dialer', label: 'Dialer', icon: PhoneCall },
  { href: '/portal/analytics', label: 'Analytics', icon: BarChart3 },
] as const

/** Leads are the first stop; campaign administration remains one click away. */
const LEAD_NAV = [
  { href: '/portal/leads', label: 'Leads', icon: Inbox },
  { href: '/portal/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/portal/leads/analytics', label: 'Analytics', icon: BarChart3, ownerOnly: true },
] as const

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href || pathname.startsWith('/portal/course') || pathname === '/portal/dialer/script'
  if (href === '/portal/dialer' && pathname === '/portal/dialer/script') return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Which products this account holds; reactivation is always on. */
function useProducts() {
  const { data } = usePageData<any>('/portal/_layout')
  return { reactivation: true, leadFollowUp: Boolean(data?.products?.leadFollowUp), isOwner: data?.participant?.role === 'owner' }
}

/** The logo goes home to whichever product you are in. */
export function PortalHomeLink({ children }: { children: React.ReactNode }) {
  const [pathname] = useLocation()
  return (
    <Link href={PRODUCT_HOME[productForPath(pathname)]} className="flex min-w-0 items-center">
      {children}
    </Link>
  )
}

/**
 * Shown only to accounts with both products: names the product you are in
 * and switches to the other one. Single-product accounts never see it.
 */
function ProductSwitch({ pathname }: { pathname: string }) {
  const current = productForPath(pathname)
  const other = current === 'reactivation' ? 'lead_followup' : 'reactivation'
  return (
    <div className="mr-2 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-muted/40 py-1 pl-2.5 pr-1" data-testid="product-switch">
      <span
        className={cn('text-xs font-semibold uppercase tracking-wide', current === 'lead_followup' ? 'text-amber-800' : 'text-primary')}
        data-testid="text-current-product"
      >
        {PRODUCT_LABELS[current]}
      </span>
      <Link
        href={PRODUCT_HOME[other]}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        title={`Switch to ${PRODUCT_LABELS[other]}`}
        data-testid="link-switch-product"
      >
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        {PRODUCT_LABELS[other]}
      </Link>
    </div>
  )
}

export function PortalNav() {
  const [pathname] = useLocation();
  const products = useProducts()
  const inLeadFollowUp = productForPath(pathname) === 'lead_followup'
  const items = inLeadFollowUp ? LEAD_NAV : NAV
  return (
    <nav className="order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:px-0" aria-label="Portal">
      {products.leadFollowUp ? <ProductSwitch pathname={pathname} /> : null}
      {items.map((item) => {
        if ('ownerOnly' in item && item.ownerOnly && !products.isOwner) return null
        const active = item.href === '/portal/leads' ? pathname === item.href : isActive(pathname, item.href, 'exact' in item)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
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
