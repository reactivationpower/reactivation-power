import { LogOut, PlayCircle, Plus } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

import './_group.css'
import './EditorialHierarchy.css'
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

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function Sidebar() {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-sidebar md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <img
          src="/__mockup/images/logo.png"
          alt="Reactivation Power"
          width={1177}
          height={480}
          className="h-8 w-auto"
        />
        <div className="min-w-0 border-l border-border pl-3">
          <p className="truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
            Training
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            Umbrella portal
          </p>
        </div>
      </div>

      <div className="px-5 pb-3">
        <a
          href="/admin/participants?new=1"
          onClick={preventNavigation}
          className={`eh-lift flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground ${focusRing}`}
        >
          <Plus className="size-3.5" />
          Add Participant
        </a>
      </div>

      <nav className="flex-1 px-3 pb-2 md:overflow-y-auto">
        {adminNavigation.map((group) => (
          <div key={group.group} className="mb-3">
            <p className="eh-eyebrow px-2 pb-1 pt-2">{group.group}</p>
            <ul className="flex flex-wrap gap-x-1 gap-y-0.5 md:flex-col">
              {group.items.map((item) => {
                const active = item.href === '/admin'
                const Icon = item.icon
                return (
                  <li key={item.href} className="md:w-full">
                    <a
                      href={item.href}
                      onClick={preventNavigation}
                      aria-current={active ? 'page' : undefined}
                      className={`eh-nav relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] ${focusRing} ${
                        active
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-sidebar-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon
                        className={`size-3.5 ${
                          active ? 'text-accent' : 'text-muted-foreground'
                        }`}
                      />
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="eh-eyebrow">Status</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Live
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between text-[13px]">
          <span className="text-foreground">All systems</span>
          <span className="font-medium text-success">Healthy</span>
        </div>
        <button
          type="button"
          onClick={inert}
          className={`eh-lift mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted ${focusRing}`}
        >
          <LogOut className="size-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function SectionHeading({
  title,
  aside,
}: {
  title: string
  aside?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-foreground/80 pb-2">
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {aside ? (
        <span className="eh-eyebrow shrink-0 text-muted-foreground">
          {aside}
        </span>
      ) : null}
    </div>
  )
}

function Content() {
  const { cards, mostWatched, recentViewers } = adminDashboardData

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
        <div>
          <p className="eh-eyebrow text-accent">Training</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Gated mini-courses with viewer analytics
          </p>
        </div>
        <a
          href="/admin/courses"
          onClick={preventNavigation}
          className={`eh-lift rounded-md border border-input bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted ${focusRing}`}
        >
          Manage courses
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-y-6 border-b border-border py-5 xl:grid-cols-4 xl:gap-y-0">
        {cards.map((card, index) => (
          <div
            key={card.label}
            className={`flex flex-col px-4 first:pl-0 ${
              index % 2 === 1 ? 'border-l border-border' : ''
            } ${index >= 2 ? 'xl:border-l' : ''}`}
          >
            <dt className="eh-eyebrow">{card.label}</dt>
            <dd
              className={`mt-2 text-[34px] font-semibold leading-none tracking-tight tabular-nums ${
                card.accent ? 'text-accent' : 'text-foreground'
              }`}
            >
              {card.value}
            </dd>
            <dd className="mt-2 text-[12px] text-muted-foreground">
              {card.sub}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionHeading title="Most watched videos" aside="Watch time" />
          <ol className="divide-y divide-border">
            {mostWatched.map((video, index) => (
              <li
                key={video.title}
                className="eh-row -mx-2 flex items-baseline gap-4 rounded-md px-2 py-2.5"
              >
                <span className="w-6 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium leading-snug tracking-tight text-foreground">
                    {video.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {video.starts} viewer{video.starts === 1 ? '' : 's'} started
                    <span className="mx-1.5 text-border">|</span>
                    {video.completions} completed
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium tabular-nums text-accent">
                  <PlayCircle className="size-3.5" />
                  {formatDuration(video.totalSeconds)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lg:col-span-2">
          <SectionHeading title="Recent viewers" aside="Last seen" />
          <ul className="divide-y divide-border">
            {recentViewers.map((viewer) => (
              <li
                key={viewer.email}
                className="eh-row -mx-2 flex items-baseline justify-between gap-4 rounded-md px-2 py-2.5"
              >
                <div className="min-w-0">
                  <a
                    href="/admin/participants"
                    onClick={preventNavigation}
                    className={`eh-link block truncate rounded-sm text-[14px] font-medium leading-snug tracking-tight text-foreground ${focusRing}`}
                  >
                    {viewer.first_name} {viewer.last_name}
                  </a>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {viewer.email}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {formatRecentViewerDate(viewer.lastSeen)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function EditorialHierarchy() {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-border bg-card px-5">
          <p className="text-[12px] text-muted-foreground">Training Admin</p>
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
              A
            </div>
            <div className="hidden sm:block">
              <p className="text-[13px] font-semibold leading-tight text-foreground">
                Admin
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Super Admin
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-5 py-5 lg:px-8">
          <Content />
        </main>
      </div>
    </div>
  )
}
