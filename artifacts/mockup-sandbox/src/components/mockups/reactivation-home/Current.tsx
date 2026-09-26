import { PlayCircle, UserPlus } from 'lucide-react'
import type { MouseEvent } from 'react'

import './_group.css'
import { PortalShell } from './_shared/PortalShell'

// Static snapshot of the owner view: network requests and course navigation are disabled.
const participant = { first_name: 'Jason' }
const isOwner = true
const activeStaff = 3
const MAX_STAFF = 5
const withProgress = [
  {
    course: {
      id: 'healthcare-training',
      slug: 'healthcare-training',
      title: 'Healthcare Reactivation Training',
      description: 'Learn how to reconnect with past patients and bring them back to your practice.',
    },
    completed: 0,
    total: 18,
    percent: 0,
  },
]

const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()

function PortalHomePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Reactivation Power
          </p>
          <h1 className="mt-2 text-4xl font-bold text-foreground text-balance">
            Training Portal
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back, {participant.first_name}. Pick a course below to
            start or continue your training.
          </p>
        </div>
        {isOwner && (
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:pt-1">
            <button
              type="button"
              className="group/button inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent bg-primary bg-clip-padding px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none select-none hover:bg-primary/80"
            >
              <UserPlus className="size-4" />
              Add Staff Member
            </button>
            <p className="text-xs text-muted-foreground">
              {activeStaff}/{MAX_STAFF} active · new staff see this training
              first
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {withProgress.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="font-medium text-foreground">
              No courses assigned yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact your administrator to get access to training courses.
            </p>
          </div>
        ) : (
          withProgress.map(({ course, completed, total, percent }) => (
            <a
              key={course.id}
              href={`/portal/course/${course.slug}`}
              onClick={preventNavigation}
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold text-foreground">
                  {course.title}
                </h2>
                <PlayCircle className="size-6 shrink-0 text-accent" />
              </div>
              {course.description && (
                <p className="mt-2 text-muted-foreground leading-relaxed">
                  {course.description}
                </p>
              )}
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {completed} of {total} videos complete
                  </span>
                  <span className="font-medium text-accent group-hover:underline">
                    {completed > 0 ? 'Continue →' : 'Start →'}
                  </span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  )
}

export function Current() {
  return (
    <PortalShell>
      <PortalHomePage />
    </PortalShell>
  )
}