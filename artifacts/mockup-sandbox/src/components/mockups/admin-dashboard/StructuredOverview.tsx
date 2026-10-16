import { ArrowUpRight, LogOut, Plus } from 'lucide-react'
import type { MouseEvent } from 'react'

import './_group.css'
import './StructuredOverview.css'
import {
  adminDashboardData,
  formatDuration,
  formatRecentViewerDate,
} from './_data'
import { adminNavigation } from './Current'

const inert = () => undefined
const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault()
}

const initialsOf = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()

function Sidebar() {
  return (
    <aside className="so-sidebar flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <img
          src="/__mockup/images/logo.png"
          alt="Reactivation Power"
          width={1177}
          height={480}
          className="h-8 w-auto"
        />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold text-foreground">
            Training
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            Umbrella portal
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <a
          href="/admin/participants?new=1"
          onClick={preventNavigation}
          className="so-focus flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          Add Participant
        </a>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {adminNavigation.map((group) => (
          <div key={group.group} className="mb-3">
            <p className="mb-0.5 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                      className={`so-focus so-nav flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                        active
                          ? 'so-nav-active bg-accent text-accent-foreground'
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

      <div className="border-t border-border px-4 py-3">
        <dl className="so-mono grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          <dt className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Status
          </dt>
          <dd className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Live
          </dd>
          <dt className="text-foreground">All systems</dt>
          <dd className="text-right font-medium text-success">Healthy</dd>
        </dl>
        <button
          type="button"
          onClick={inert}
          className="so-focus mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="size-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function MetricStrip() {
  const { cards } = adminDashboardData
  return (
    <section
      aria-label="Key metrics"
      className="so-strip grid grid-cols-1 overflow-hidden rounded-md border border-border bg-card sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card, index) => (
        <div
          key={card.label}
          className="so-strip-cell relative flex flex-col gap-1 px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {card.label}
            </p>
            <span className="so-mono text-[10px] tabular-nums text-muted-foreground/70">
              {String(index + 1).padStart(2, '0')}
            </span>
          </div>
          <p
            className={`so-mono text-[26px] font-semibold leading-none tabular-nums tracking-tight ${
              card.accent ? 'text-accent' : 'text-foreground'
            }`}
          >
            {card.value}
          </p>
          <p className="text-xs text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </section>
  )
}

function VideosTable() {
  const { mostWatched } = adminDashboardData
  return (
    <section
      aria-labelledby="so-videos"
      className="so-table-wrap min-w-0 overflow-hidden rounded-md border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2
            id="so-videos"
            className="text-[13px] font-semibold text-foreground"
          >
            Most watched videos
          </h2>
          <span className="so-mono text-[11px] tabular-nums text-muted-foreground">
            {mostWatched.length} rows
          </span>
        </div>
        <a
          href="/admin/courses"
          onClick={preventNavigation}
          className="so-focus so-link inline-flex items-center gap-1 rounded text-xs font-medium text-accent"
        >
          Courses
          <ArrowUpRight className="size-3.5" />
        </a>
      </header>
      <div className="overflow-x-auto">
        <table className="so-table w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <th scope="col" className="w-8 px-4 py-2 text-left font-semibold">
                #
              </th>
              <th scope="col" className="px-2 py-2 text-left font-semibold">
                Title
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Started
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Completed
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Watch time
              </th>
            </tr>
          </thead>
          <tbody>
            {mostWatched.map((video, index) => (
              <tr key={video.title} className="so-row">
                <td className="so-mono px-4 py-2 text-xs tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </td>
                <td className="max-w-[28rem] px-2 py-2 font-medium text-foreground">
                  <span className="block truncate" title={video.title}>
                    {video.title}
                  </span>
                </td>
                <td className="so-mono whitespace-nowrap px-2 py-2 text-right tabular-nums text-foreground">
                  {video.starts}
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    viewer{video.starts === 1 ? '' : 's'}
                  </span>
                </td>
                <td className="so-mono whitespace-nowrap px-2 py-2 text-right tabular-nums text-foreground">
                  {video.completions}
                </td>
                <td className="so-mono whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-accent">
                  {formatDuration(video.totalSeconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ViewersDirectory() {
  const { recentViewers } = adminDashboardData
  return (
    <section
      aria-labelledby="so-viewers"
      className="so-table-wrap min-w-0 overflow-hidden rounded-md border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2
            id="so-viewers"
            className="text-[13px] font-semibold text-foreground"
          >
            Recent viewers
          </h2>
          <span className="so-mono text-[11px] tabular-nums text-muted-foreground">
            {recentViewers.length} rows
          </span>
        </div>
        <a
          href="/admin/participants"
          onClick={preventNavigation}
          className="so-focus so-link inline-flex items-center gap-1 rounded text-xs font-medium text-accent"
        >
          Viewers
          <ArrowUpRight className="size-3.5" />
        </a>
      </header>
      <div className="overflow-x-auto">
        <table className="so-table w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <th scope="col" className="px-4 py-2 text-left font-semibold">
                Viewer
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {recentViewers.map((viewer) => (
              <tr key={viewer.email} className="so-row">
                <td className="px-4 py-1.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="so-mono flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted text-[10.5px] font-semibold text-secondary-foreground"
                    >
                      {initialsOf(viewer.first_name, viewer.last_name)}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <a
                        href="/admin/participants"
                        onClick={preventNavigation}
                        className="so-focus so-link block truncate rounded font-medium text-foreground"
                      >
                        {viewer.first_name} {viewer.last_name}
                      </a>
                      <p
                        className="so-mono truncate text-[11px] text-muted-foreground"
                        title={viewer.email}
                      >
                        {viewer.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="so-mono whitespace-nowrap px-4 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                  {formatRecentViewerDate(viewer.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function StructuredOverview() {
  return (
    <div className="so-root flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-5">
          <p className="text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">Training Admin</span>
            <span className="mx-2 text-border">/</span>
            Dashboard
          </p>
          <div className="flex items-center gap-2.5">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[13px] font-semibold text-foreground">Admin</p>
              <p className="text-[11px] text-muted-foreground">Super Admin</p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              A
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5 lg:px-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Training
                </p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
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
                className="so-focus rounded-md border border-input bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Manage courses
              </a>
            </div>

            <MetricStrip />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <VideosTable />
              <ViewersDirectory />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
