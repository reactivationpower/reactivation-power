// @ts-nocheck


import { Link } from "wouter";
import { useLocation, useParams } from "wouter";
import {
  BadgeDollarSign,
  BarChart3,
  Banknote,
  ClipboardList,
  CreditCard,
  FilePenLine,
  Globe,
  LayoutGrid,
  LogOut,
  Mail,
  PhoneCall,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { adminLogout, type AdminIdentity, type AdminRole } from '@/app/actions/admin-auth'
import { cn } from '@/lib/utils'

/**
 * Sidebar navigation by role. Sales reps only get the sales-facing sections
 * (payments, agreements and their own commissions), super admins get everything.
 */
const NAV: { group: string; items: { href: string; label: string; icon: any; roles?: AdminRole[] }[] }[] = [
  {
    group: 'Dashboard',
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutGrid, roles: ['super_admin'] }],
  },
  {
    group: 'Operations',
    items: [
      { href: '/admin/courses', label: 'Courses', icon: ClipboardList, roles: ['super_admin'] },
      { href: '/admin/participants', label: 'Viewers', icon: Users, roles: ['super_admin'] },
      { href: '/admin/reactivation', label: 'Reactivation', icon: PhoneCall, roles: ['super_admin'] },
      { href: '/admin/emails', label: 'Email Templates', icon: Mail, roles: ['super_admin'] },
      { href: '/admin/payments', label: 'Payments', icon: CreditCard },
      { href: '/admin/agreements', label: 'Agreements', icon: FilePenLine },
      { href: '/admin/commissions', label: 'Commissions', icon: BadgeDollarSign },
      { href: '/admin/landing', label: 'Landing Pages', icon: Globe, roles: ['super_admin'] },
    ],
  },
  {
    group: 'Insights',
    items: [
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, roles: ['super_admin'] },
      { href: '/admin/billing', label: 'Billing', icon: Banknote, roles: ['super_admin'] },
    ],
  },
  {
    group: 'Settings',
    items: [{ href: '/admin/team', label: 'Team', icon: ShieldCheck, roles: ['super_admin'] }],
  },
]

export function AdminSidebar({ admin }: { admin: AdminIdentity | null }) {
  const [pathname] = useLocation();
  const role: AdminRole = admin?.role ?? 'sales_rep'
  const nav = NAV
    .map((group) => ({ ...group, items: group.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <img
            src="/images/logo.png"
            alt="Reactivation Power"
            width={1177}
            height={480}
            className="h-10 w-auto"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              Training
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Umbrella portal
            </p>
          </div>
        </div>
      </div>

      {role === 'super_admin' ? (
      <div className="px-4 pb-2">
        <Link
          href="/admin/participants?new=1"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Add Participant
        </Link>
      </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-4 py-2">
        {nav.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="mb-1 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.group}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active =
                  item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname.startsWith(item.href)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full bg-success" />
            Live
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-foreground">All systems</span>
          <span className="font-medium text-success">Healthy</span>
        </div>
        <form action={adminLogout} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  )
}
