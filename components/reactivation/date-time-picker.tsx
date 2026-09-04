'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  combineDateTime,
  formatLazyTime,
  parseLazyTime,
  type LazyTime,
} from '@/lib/lazy-time'

interface Props {
  value: Date | null
  onChange: (value: Date | null) => void
  /** Earliest selectable day (defaults to today) */
  minDate?: Date
  /** Default time when a day is picked before any time is typed */
  defaultTime?: LazyTime
  /** id for the time input, so a Label can point at it */
  timeInputId?: string
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Month calendar + lazy time entry. The time box accepts what a caller would
 * say — "9p", "1030", "2:15 pm" — and shows the resolved time beside it with
 * an AM/PM toggle. Emits a full Date (local) whenever both halves are valid.
 */
export function DateTimePicker({
  value,
  onChange,
  minDate,
  defaultTime = { hour: 10, minute: 0 },
  timeInputId = 'lazy-time',
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const min = useMemo(
    () => startOfDay(minDate ?? new Date()),
    [minDate],
  )
  const [month, setMonth] = useState(() => {
    const base = value ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [day, setDay] = useState<Date | null>(value ? startOfDay(value) : null)
  const [time, setTime] = useState<LazyTime>(
    value ? { hour: value.getHours(), minute: value.getMinutes() } : defaultTime,
  )
  const [timeText, setTimeText] = useState(
    value ? formatLazyTime({ hour: value.getHours(), minute: value.getMinutes() }) : '',
  )
  const [timeInvalid, setTimeInvalid] = useState(false)

  // Push a combined value up whenever day or time changes
  useEffect(() => {
    onChange(day ? combineDateTime(day, time) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, time])

  const grid = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const lead = first.getDay()
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < lead; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++)
      cells.push(new Date(month.getFullYear(), month.getMonth(), d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month])

  function handleTimeText(text: string) {
    setTimeText(text)
    const parsed = parseLazyTime(text)
    if (parsed) {
      setTime(parsed)
      setTimeInvalid(false)
    } else {
      setTimeInvalid(text.trim().length > 0)
    }
  }

  function commitTimeText() {
    // On blur, normalize whatever they typed into the clean label
    const parsed = parseLazyTime(timeText)
    if (parsed) {
      setTimeText(formatLazyTime(parsed))
      setTimeInvalid(false)
    } else if (!timeText.trim()) {
      setTimeText(formatLazyTime(time))
    }
  }

  function toggleMeridiem(pm: boolean) {
    const isPm = time.hour >= 12
    if (pm === isPm) return
    const next = { ...time, hour: pm ? time.hour + 12 : time.hour - 12 }
    setTime(next)
    setTimeText(formatLazyTime(next))
    setTimeInvalid(false)
  }

  const monthLabel = month.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const isPm = time.hour >= 12

  return (
    <div className="flex flex-col gap-4">
      {/* Calendar */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
          <button
            type="button"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div
          className="grid grid-cols-7 gap-y-1 text-center"
          role="grid"
          aria-label={monthLabel}
        >
          {DOW.map((d) => (
            <div
              key={d}
              className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              role="columnheader"
            >
              {d}
            </div>
          ))}
          {grid.map((cell, i) => {
            if (!cell) return <div key={`e${i}`} aria-hidden="true" />
            const disabled = cell < min
            const selected = day ? sameDay(cell, day) : false
            const isToday = sameDay(cell, today)
            return (
              <button
                key={cell.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => setDay(cell)}
                aria-pressed={selected}
                aria-label={cell.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
                className={cn(
                  'mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors',
                  disabled && 'cursor-not-allowed text-muted-foreground/40',
                  !disabled && !selected && 'text-foreground hover:bg-muted',
                  isToday && !selected && 'font-semibold text-accent',
                  selected &&
                    'bg-accent font-semibold text-accent-foreground shadow-sm',
                )}
              >
                {cell.getDate()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-stretch gap-2">
          <Input
            id={timeInputId}
            value={timeText}
            onChange={(e) => handleTimeText(e.target.value)}
            onBlur={commitTimeText}
            placeholder={`Time — try "9p" or "1030"`}
            inputMode="text"
            autoComplete="off"
            aria-invalid={timeInvalid}
            className={cn(
              'h-10 flex-1 text-base tabular-nums',
              timeInvalid && 'border-destructive focus-visible:ring-destructive',
            )}
          />
          <div
            className="flex overflow-hidden rounded-md border border-input"
            role="group"
            aria-label="AM or PM"
          >
            {(['AM', 'PM'] as const).map((m) => {
              const active = m === 'PM' ? isPm : !isPm
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMeridiem(m === 'PM')}
                  aria-pressed={active}
                  className={cn(
                    'px-3 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {day ? (
            <>
              <span className="font-medium text-foreground">
                {day.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              {' at '}
              <span className="font-medium text-foreground">
                {formatLazyTime(time)}
              </span>
              {timeInvalid && (
                <span className="text-destructive">
                  {' '}
                  — keep typing, that isn&apos;t a time yet
                </span>
              )}
            </>
          ) : (
            'Pick a day above, then type the time.'
          )}
        </p>
      </div>
    </div>
  )
}
