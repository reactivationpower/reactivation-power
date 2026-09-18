import {
  BarChart3,
  ClipboardList,
  CreditCard,
  Globe,
  LayoutGrid,
  LogOut,
  Mail,
  PhoneCall,
  PlayCircle,
  Plus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { MouseEvent } from 'react'

import './_group.css'
import {
  adminDashboardData,
  formatDuration,
  formatRecentViewerDate,
} from './_data'

interface NavigationItem {
  href: string
  label: string
  icon: LucideIcon
}

interface NavigationGroup {
  group: string
  items: NavigationItem[]
}

export const adminNavigation: NavigationGroup[] = [
  {
    group: 'Dashboard',
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutGrid }],
  },
  {
    group: 'Operations',
    items: [
      { href: '/admin/courses', label: 'Courses', icon: ClipboardList },
      { href: '/admin/participants', label: 'Viewers', icon: Users },
      { href: '/admin/reactivation', label: 'Reactivation', icon: PhoneCall },
      { href: '/admin/emails', label: 'Email Templates', icon: Mail },
      { href: '/admin/payments', label: 'Payments', icon: CreditCard },
      { href: '/admin/landing', label: 'Landing Pages', icon: Globe },
    ],
  },
  {
    group: 'Insights',
    items: [{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 }],
  },
]

const inert = () => undefined
const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault()
}

function AdminSidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <img
            src="/__mockup/images/logo.png"
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

      <div className="px-4 pb-2">
        <a
          href="/admin/participants?new=1"
          onClick={preventNavigation}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Add Participant
        </a>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-2">
        {adminNavigation.map((group) => (
          <div key={group.group} className="mb-4">
            <p className="mb-1 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.group}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = item.href === '/admin'
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={preventNavigation}
                      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </a>
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
        <button
          type="button"
          onClick={inert}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="size-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function DashboardContent() {
  const { mostWatched, recentViewers, cards } = adminDashboardData

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Training</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gated mini-courses with viewer analytics
          </p>
        </div>
        <a
          href="/admin/courses"
          onClick={preventNavigation}
          className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Manage courses
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {card.label}
            </p>
            <p
              className={`mt-2 text-3xl font-bold ${
                card.accent ? 'text-accent' : 'text-foreground'
              }`}
            >
              {card.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card lg:col-span-3">
          <h2 className="border-b border-border p-5 text-lg font-semibold text-foreground">
            Most watched videos
          </h2>
          <ul>
            {mostWatched.map((video) => (
              <li
                key={video.title}
                className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {video.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {video.starts} viewer{video.starts === 1 ? '' : 's'} started
                    {' · '}
                    {video.completions} completed
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-accent">
                  <PlayCircle className="size-4" />
                  {formatDuration(video.totalSeconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card lg:col-span-2">
          <h2 className="border-b border-border p-5 text-lg font-semibold text-foreground">
            Recent viewers
          </h2>
          <ul>
            {recentViewers.map((viewer) => (
              <li
                key={viewer.email}
                className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <a
                    href="/admin/participants"
                    onClick={preventNavigation}
                    className="truncate font-medium text-foreground hover:text-accent"
                  >
                    {viewer.first_name} {viewer.last_name}
                  </a>
                  <p className="truncate text-sm text-muted-foreground">
                    {viewer.email}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRecentViewerDate(viewer.lastSeen)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function Current() {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <p className="text-sm text-muted-foreground">Training Admin</p>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              A
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight text-foreground">
                Admin
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                Super Admin
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <DashboardContent />
        </main>
      </div>
    </div>
  )
}