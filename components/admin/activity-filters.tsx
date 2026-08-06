'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

const EVENT_TYPES = [
  { value: 'login', label: 'Logins' },
  { value: 'video_start', label: 'Video starts' },
  { value: 'video_progress', label: 'Watch progress' },
  { value: 'video_complete', label: 'Completions' },
  { value: 'attachment_download', label: 'Downloads' },
  { value: 'module_unlock', label: 'Module unlocks' },
]

export function ActivityFilters({
  participants,
  courses,
}: {
  participants: { id: string; name: string }[]
  courses: { id: string; title: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete(key)
    else params.set(key, value)
    router.replace(`/admin/analytics?${params.toString()}#activity`, {
      scroll: false,
    })
  }

  const hasFilters =
    searchParams.has('participant') ||
    searchParams.has('course') ||
    searchParams.has('event')

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={searchParams.get('participant') ?? 'all'}
        onValueChange={(v) => setParam('participant', v ?? 'all')}
        items={[
          { value: 'all', label: 'All viewers' },
          ...participants.map((p) => ({ value: p.id, label: p.name })),
        ]}
      >
        <SelectTrigger className="w-52" aria-label="Filter by viewer">
          <SelectValue placeholder="All viewers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All viewers</SelectItem>
          {participants.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('course') ?? 'all'}
        onValueChange={(v) => setParam('course', v ?? 'all')}
        items={[
          { value: 'all', label: 'All courses' },
          ...courses.map((c) => ({ value: c.id, label: c.title })),
        ]}
      >
        <SelectTrigger className="w-52" aria-label="Filter by course">
          <SelectValue placeholder="All courses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('event') ?? 'all'}
        onValueChange={(v) => setParam('event', v ?? 'all')}
        items={[
          { value: 'all', label: 'All events' },
          ...EVENT_TYPES.map((e) => ({ value: e.value, label: e.label })),
        ]}
      >
        <SelectTrigger className="w-44" aria-label="Filter by event type">
          <SelectValue placeholder="All events" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All events</SelectItem>
          {EVENT_TYPES.map((e) => (
            <SelectItem key={e.value} value={e.value}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => router.replace('/admin/analytics#activity')}
        >
          <X className="size-3.5" />
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
