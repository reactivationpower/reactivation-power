import { LogOut, PlayCircle, Plus } from 'lucide-react'
import type { MouseEvent } from 'react'

import './_group.css'
import './UnifiedWorkspace.css'
import { adminNavigation } from './Current'
import {
  adminDashboardData,
  formatDuration,
  formatRecentViewerDate,
} from './_data'

const inert = () => undefined
const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault()
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

function UnifiedSidebar() {
  return (
    <aside className="uw-sidebar flex w-60 shrink-0 flex-col bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <img
          src="/__mockup/images/logo.png"
          alt="Reactivation Power"
          width={1177}
          height={480}
          className="h-8 w-auto"
        />
        <div className="min-w-0 border-l border-border pl-2.5">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
            Training
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            Umbrella portal
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <a
          href="/admin/participants?new=1"
          onClick={preventNavigation}
          className="uw-focus flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Add Participant
        </a>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {adminNavigation.map((group) => (
          <div key={group.group} className="mb-3">
            <p className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.group}
            </p>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = item.href === '/admin'
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={preventNavigation}
                      aria-current={active ? 'page' : undefined}
                      className={`uw-nav-item uw-focus flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between rounded-md bg-muted px-2.5 py-2">
          <div className="flex flex-col">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Status
            </span>
            <span className="text-[13px] text-foreground">All systems</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              Live
            </span>
            <span className="text-[13px] font-medium text-success">Healthy</span>
          </div>
        </div>
        <button
          type="button"
          onClick={inert}
          className="uw-focus mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="size-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function Workspace() {
  const { mostWatched, recentViewers, cards } = adminDashboardData

  return (
    <div className="mx-auto w-full max-w-7xl">
      <section
        aria-label="Training dashboard"
        className="uw-sheet overflow-hidden rounded-lg border border-border bg-card"
      >
        {/* Sheet header: title row shares the surface */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              Training
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Gated mini-courses with viewer analytics
            </p>
          </div>
          <a
            href="/admin/courses"
            onClick={preventNavigation}
            className="uw-focus rounded-md border border-input bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Manage courses
          </a>
        </div>

        {/* Metric strip: one continuous band split by hairlines */}
        <dl className="uw-metrics grid grid-cols-2 border-b border-border xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="uw-metric px-5 py-3.5">
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {card.label}
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
                <span
                  className={`text-2xl font-semibold leading-none tracking-tight tabular-nums ${
                    card.accent ? 'text-accent' : 'text-foreground'
                  }`}
                >
                  {card.value}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {card.sub}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        {/* Two lists side by side, separated by one shared divider */}
        <div className="uw-lists grid grid-cols-1 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
              <h2 className="text-[13px] font-semibold text-foreground">
                Most watched videos
              </h2>
              <span className="hidden text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:block">
                Watch time
              </span>
            </div>
            <ol className="uw-rows">
              {mostWatched.map((video, index) => (
                <li
                  key={video.title}
                  className="uw-row flex items-center gap-3 px-5 py-2.5"
                >
                  <span className="w-5 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {video.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {video.starts} viewer{video.starts === 1 ? '' : 's'}{' '}
                      started
                      {' · '}
                      {video.completions} completed
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium tabular-nums text-accent">
                    <PlayCircle className="size-4" />
                    {formatDuration(video.totalSeconds)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="uw-lists-secondary lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
              <h2 className="text-[13px] font-semibold text-foreground">
                Recent viewers
              </h2>
              <span className="hidden text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:block">
                Last seen
              </span>
            </div>
            <ul className="uw-rows">
              {recentViewers.map((viewer) => (
                <li
                  key={viewer.email}
                  className="uw-row flex items-center gap-3 px-5 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10.5px] font-semibold text-secondary-foreground"
                  >
                    {initials(viewer.first_name, viewer.last_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href="/admin/participants"
                      onClick={preventNavigation}
                      className="uw-focus block truncate rounded-sm text-[13px] font-medium text-foreground transition-colors hover:text-accent"
                    >
                      {viewer.first_name} {viewer.last_name}
                    </a>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {viewer.email}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatRecentViewerDate(viewer.lastSeen)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

export function UnifiedWorkspace() {
  return (
    <div className="uw-root flex min-h-screen bg-background">
      <UnifiedSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-5">
          <p className="text-[13px] text-muted-foreground">Training Admin</p>
          <div className="flex items-center gap-2.5">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-semibold leading-tight text-foreground">
                Admin
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Super Admin
              </p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
              A
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Workspace />
        </main>
      </div>
    </div>
  )
}
