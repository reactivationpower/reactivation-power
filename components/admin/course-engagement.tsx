'use client'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { formatDuration } from '@/lib/format'
import { Play } from 'lucide-react'

export interface VideoStat {
  id: string
  title: string
  duration: number | null
  started: number
  completed: number
  avgPercent: number
  totalWatch: number
}

export interface ModuleStat {
  id: string
  title: string
  videos: VideoStat[]
}

export interface CourseStat {
  id: string
  title: string
  status: string
  modules: ModuleStat[]
  viewersStarted: number
  totalWatch: number
  avgCompletion: number
}

export function CourseEngagement({ courses }: { courses: CourseStat[] }) {
  if (courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No courses yet — create one under Courses.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {courses.map((course) => {
        const videoCount = course.modules.reduce(
          (n, m) => n + m.videos.length,
          0,
        )
        return (
          <div
            key={course.id}
            className="rounded-lg border border-border bg-card p-6"
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold">{course.title}</h3>
              <Badge variant={course.status === 'live' ? 'default' : 'secondary'}>
                {course.status === 'live' ? 'LIVE' : 'DRAFT'}
              </Badge>
              <Badge variant="outline">
                {Math.round(course.avgCompletion)}% completion
              </Badge>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
              <Stat label="Modules" value={String(course.modules.length)} />
              <Stat label="Videos" value={String(videoCount)} />
              <Stat
                label="Viewers started"
                value={String(course.viewersStarted)}
              />
              <Stat
                label="Total watch"
                value={formatDuration(course.totalWatch)}
              />
              <Stat
                label="Avg completion"
                value={`${Math.round(course.avgCompletion)}%`}
              />
            </div>
            <Progress value={course.avgCompletion} className="mb-4 h-2" />

            <Accordion className="w-full">
              {course.modules.map((mod) => {
                const started = mod.videos.reduce((n, v) => n + v.started, 0)
                const watch = mod.videos.reduce((n, v) => n + v.totalWatch, 0)
                return (
                  <AccordionItem key={mod.id} value={mod.id}>
                    <AccordionTrigger className="text-sm font-medium">
                      <span className="flex flex-1 items-center justify-between gap-4 pr-4">
                        <span>{mod.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {mod.videos.length} videos · {started} started ·{' '}
                          {formatDuration(watch)} watched
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-1">
                        {mod.videos.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
                          >
                            <Play className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {v.title}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {v.duration
                                  ? formatDuration(v.duration)
                                  : 'No duration'}
                              </span>
                            </span>
                            <span className="w-20 shrink-0 text-right text-xs">
                              <span className="block text-muted-foreground">
                                STARTED
                              </span>
                              <span className="font-medium">{v.started}</span>
                            </span>
                            <span className="w-24 shrink-0 text-right text-xs">
                              <span className="block text-muted-foreground">
                                COMPLETED
                              </span>
                              <span className="font-medium">{v.completed}</span>
                            </span>
                            <span className="w-28 shrink-0 text-right text-xs">
                              <span className="block text-muted-foreground">
                                AVG WATCH
                              </span>
                              <span className="font-medium">
                                {v.started > 0
                                  ? `${Math.round(v.avgPercent)}%`
                                  : '—'}
                              </span>
                            </span>
                            <span className="w-28 shrink-0">
                              <Progress
                                value={v.started > 0 ? v.avgPercent : 0}
                                className="h-1.5"
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  )
}
