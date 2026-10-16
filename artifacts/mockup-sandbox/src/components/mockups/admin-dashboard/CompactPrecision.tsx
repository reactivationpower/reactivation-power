import { LogOut, PlayCircle, Plus } from 'lucide-react'
import type { MouseEvent } from 'react'

import './_group.css'
import './CompactPrecision.css'
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

const initials = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()

function Sidebar() {
  return (
    <aside className="cp-sidebar flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-12 items-center gap-2.5 border-b border-border px-3">
        <img
          src="/__mockup/images/logo.png"
          alt="Reactivation Power"
          width={1177}
          height={480}
          className="h-7 w-auto"
        />
        <div className="min-w-0 leading-none">
          <p className="truncate text-[13px] font-semibold text-foreground">
            Training
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Umbrella portal
          </p>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <a
          href="/admin/participants?new=1"
          onClick={preventNavigation}
          className="cp-focus flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          Add Participant
        </a>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {adminNavigation.map((group) => (
          <div key={group.group} className="mb-3">
            <p className="px-2 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                      className={`cp-nav cp-focus flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium ${
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="size-4 shrink-0 opacity-90" />
                      <span className="truncate">{item.label}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Status
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Live
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[13px]">
          <span className="text-foreground">All systems</span>
          <span className="font-medium text-success">Healthy</span>
        </div>
        <button
          type="button"
          onClick={inert}
          className="cp-focus mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="size-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function Metrics() {
  const { cards } = adminDashboardData
  return (
    <section
      aria-label="Key metrics"
      className="cp-metrics grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <div key={card.label} className="cp-metric px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {card.label}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <p
              className={`text-[22px] font-semibold leading-none tracking-tight tabular-nums ${
                card.accent ? 'text-accent' : 'text-foreground'
              }`}
            >
              {card.value}
            </p>
            <p className="truncate text-right text-xs text-muted-foreground">
              {card.sub}
            </p>
          </div>
        </div>
      ))}
    </section>
  )
}

function MostWatched() {
  const { mostWatched } = adminDashboardData
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:col-span-3">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold text-foreground">
          Most watched videos
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {mostWatched.length} videos
        </span>
      </div>
      <div
        role="row"
        className="cp-video-grid hidden items-center border-b border-border bg-muted/40 px-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid"
      >
        <span>Title</span>
        <span className="text-right">Started</span>
        <span className="text-right">Completed</span>
        <span className="text-right">Watch time</span>
      </div>
      <ul className="flex-1">
        {mostWatched.map((video, index) => (
          <li
            key={video.title}
            className="cp-row cp-video-grid border-b border-border px-4 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <p className="truncate text-[13px] font-medium text-foreground">
                {video.title}
              </p>
            </div>
            <span className="cp-cell text-right text-[13px] tabular-nums text-foreground">
              <span className="sm:hidden">
                {video.starts} viewer{video.starts === 1 ? '' : 's'} started
              </span>
              <span className="hidden sm:inline">
                {video.starts}{' '}
                <span className="text-muted-foreground">
                  viewer{video.starts === 1 ? '' : 's'}
                </span>
              </span>
            </span>
            <span className="cp-cell text-right text-[13px] tabular-nums text-foreground">
              {video.completions}
              <span className="text-muted-foreground sm:hidden"> completed</span>
            </span>
            <span className="cp-cell flex items-center justify-end gap-1 text-[13px] font-medium tabular-nums text-accent">
              <PlayCircle className="size-3.5" />
              {formatDuration(video.totalSeconds)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentViewers() {
  const { recentViewers } = adminDashboardData
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:col-span-2">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold text-foreground">
          Recent viewers
        </h2>
        <a
          href="/admin/participants"
          onClick={preventNavigation}
          className="cp-focus rounded-sm text-[11px] font-medium text-accent transition-colors hover:text-foreground"
        >
          Viewers
        </a>
      </div>
      <ul className="flex-1">
        {recentViewers.map((viewer) => (
          <li
            key={viewer.email}
            className="cp-row flex items-center gap-3 border-b border-border px-4 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10.5px] font-semibold tracking-wide text-secondary-foreground"
            >
              {initials(viewer.first_name, viewer.last_name)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <a
                href="/admin/participants"
                onClick={preventNavigation}
                className="cp-focus block truncate rounded-sm text-[13px] font-medium text-foreground transition-colors hover:text-accent"
              >
                {viewer.first_name} {viewer.last_name}
              </a>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {viewer.email}
              </p>
            </div>
            <time
              dateTime={viewer.lastSeen ?? undefined}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {formatRecentViewerDate(viewer.lastSeen)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CompactPrecision() {
  return (
    <div className="cp-root flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-border bg-card px-5">
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
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              A
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                  Training
                </p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    Dashboard
                  </h1>
                  <p className="text-[13px] text-muted-foreground">
                    Gated mini-courses with viewer analytics
                  </p>
                </div>
              </div>
              <a
                href="/admin/courses"
                onClick={preventNavigation}
                className="cp-focus flex h-8 items-center rounded-md border border-input bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Manage courses
              </a>
            </div>

            <Metrics />

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
              <MostWatched />
              <RecentViewers />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
