'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  bookStrategyCall,
  getAvailability,
  type AvailabilityResult,
} from '@/app/actions/booking'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_TIMEZONE,
  US_TIMEZONES,
  isUsTimezone,
  timezoneLabel,
} from '@/lib/us-timezones'
import { CalendarClock, ChevronLeft, Globe, Loader2 } from 'lucide-react'

const PAST_DAYS_SHOWN = 3
const WINDOW_DAYS = 45
const DAY_MS = 24 * 60 * 60 * 1000

/** Detect the visitor's timezone, mapped onto our US list (default ET). */
function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (isUsTimezone(tz)) return tz
    // Map other US IANA zones to the closest option by current offset
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
    for (const z of US_TIMEZONES) {
      const zOffset = new Intl.DateTimeFormat('en-US', {
        timeZone: z.value,
        timeZoneName: 'shortOffset',
      })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value
      if (offset && zOffset === offset) return z.value
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_TIMEZONE
}

/** "YYYY-MM-DD" for an instant, in a timezone */
function dayKey(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

/** 0 (Sun) - 6 (Sat) for an instant, in a timezone */
function weekdayIndex(ms: number, tz: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date(ms))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short)
}

interface DayCell {
  key: string
  ms: number
  dayOfMonth: number
  monthShort: string // e.g. "Sep"
  isNewMonth: boolean // first visible day of a month — wears the month tag
  isPast: boolean
}

/**
 * Build the rolling window as one continuous run of weeks (Sun-Sat rows)
 * with no month breaks — the Continuous Flow layout. Month changes are
 * marked on the cell itself via isNewMonth.
 */
function buildWeeks(tz: string): (DayCell | null)[][] {
  const now = Date.now()
  const cells: DayCell[] = []
  const seen = new Set<string>()
  let prevMonth = ''
  for (let i = -PAST_DAYS_SHOWN; i < WINDOW_DAYS; i++) {
    const ms = now + i * DAY_MS
    const key = dayKey(ms, tz)
    if (seen.has(key)) continue // DST fold safety
    seen.add(key)
    const monthShort = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
    }).format(new Date(ms))
    cells.push({
      key,
      ms,
      dayOfMonth: Number(key.slice(8, 10)),
      monthShort,
      isNewMonth: monthShort !== prevMonth,
      isPast: i < 0,
    })
    prevMonth = monthShort
  }

  const weeks: (DayCell | null)[][] = []
  let week: (DayCell | null)[] = new Array(
    weekdayIndex(cells[0].ms, tz),
  ).fill(null)
  for (const cell of cells) {
    week.push(cell)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

function slotTimeLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

function fullDateLabel(key: string, tz: string): string {
  // Noon UTC on that date avoids off-by-one across all US offsets
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${key}T12:00:00Z`))
}

export function BookingCalendar({
  contactId,
  thankYouHref,
}: {
  contactId: string
  /** Thank-you page URL with the lead's details; slot + tz are appended */
  thankYouHref: string
}) {
  const router = useRouter()
  const [timezone, setTimezone] = useState<string>(() => detectTimezone())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [mobileStep, setMobileStep] = useState<'day' | 'time'>('day')
  const [booking, setBooking] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)

  const { data, isLoading } = useSWR<AvailabilityResult>(
    ['ghl-availability', timezone],
    () => getAvailability(timezone),
    { revalidateOnFocus: false, keepPreviousData: true },
  )

  const slots = data?.slots ?? {}
  const weeks = useMemo(() => buildWeeks(timezone), [timezone])

  const firstAvailableDay = useMemo(() => {
    for (const week of weeks) {
      for (const d of week) {
        if (d && !d.isPast && (slots[d.key]?.length ?? 0) > 0) return d.key
      }
    }
    return null
  }, [weeks, slots])

  const activeDay = selectedDay ?? firstAvailableDay
  const activeSlots = activeDay ? (slots[activeDay] ?? []) : []

  function pickDay(key: string) {
    setSelectedDay(key)
    setSelectedSlot(null)
    setBookError(null)
    setMobileStep('time')
  }

  function changeTimezone(tz: string) {
    setTimezone(tz)
    setSelectedDay(null)
    setSelectedSlot(null)
    setBookError(null)
  }

  async function confirmBooking() {
    if (!selectedSlot) return
    setBooking(true)
    setBookError(null)
    const res = await bookStrategyCall({
      contactId,
      slot: selectedSlot,
      timezone,
    })
    if (res.ok) {
      // Leave the button in its "Booking…" state while the thank-you page loads
      const url = new URL(thankYouHref, window.location.origin)
      url.searchParams.set('slot', selectedSlot)
      url.searchParams.set('tz', timezone)
      router.push(`${url.pathname}${url.search}`)
      return
    }
    setBooking(false)
    setBookError(res.error ?? 'Something went wrong. Please try again.')
  }

  // ------- Not configured / error states -------
  if (data && !data.configured) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent/10">
          <CalendarClock className="size-7 text-accent" aria-hidden="true" />
        </span>
        <p className="text-lg font-semibold text-foreground">
          Scheduling is being set up
        </p>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          We&apos;ve received your information and will reach out within one
          business day to set up your call.
        </p>
      </div>
    )
  }

  const timezonePicker = (
    <div className="flex items-center gap-2">
      <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label htmlFor="booking-tz" className="sr-only">
        Timezone
      </label>
      <select
        id="booking-tz"
        value={timezone}
        onChange={(e) => changeTimezone(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30 sm:flex-none"
      >
        {US_TIMEZONES.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
      </select>
    </div>
  )

  const calendarPane = (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, j) => (
          <span
            key={`${d}-${j}`}
            className="pb-1 text-xs font-medium text-muted-foreground"
            aria-hidden="true"
          >
            {d}
          </span>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((d, di) => {
            if (d === null) {
              return <span key={`blank-${wi}-${di}`} aria-hidden="true" />
            }
            const count = slots[d.key]?.length ?? 0
            const bookable = !d.isPast && count > 0
            const isActive = activeDay === d.key
            return (
              <button
                key={d.key}
                type="button"
                disabled={!bookable}
                onClick={() => pickDay(d.key)}
                aria-label={`${fullDateLabel(d.key, timezone)}${bookable ? `, ${count} times available` : ', unavailable'}`}
                aria-pressed={isActive}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-accent font-semibold text-accent-foreground'
                    : bookable
                      ? 'bg-accent/10 font-semibold text-accent hover:bg-accent/20'
                      : 'font-normal text-muted-foreground/40'
                }`}
              >
                {d.isNewMonth && (
                  <span
                    className={`absolute left-1/2 top-0.5 -translate-x-1/2 text-[11px] font-bold uppercase leading-none tracking-wide ${
                      isActive ? 'text-accent-foreground/80' : 'text-accent'
                    }`}
                    aria-hidden="true"
                  >
                    {d.monthShort}
                  </span>
                )}
                {d.dayOfMonth}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )

  const timesPane = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {activeDay ? fullDateLabel(activeDay, timezone) : 'Pick a day'}
        </p>
        {/* Change Date is mobile-only; on desktop the calendar stays visible */}
        <button
          type="button"
          onClick={() => setMobileStep('day')}
          className="flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80 md:hidden"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Change date
        </button>
      </div>

      {activeSlots.length === 0 ? (
        <p className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {activeDay
            ? 'No times available this day — pick another date.'
            : 'Select a highlighted date to see available times.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {activeSlots.map((iso) => {
            const isPicked = selectedSlot === iso
            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setSelectedSlot(iso)
                  setBookError(null)
                }}
                aria-pressed={isPicked}
                className={`h-11 rounded-md border text-sm font-medium transition-colors ${
                  isPicked
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-input bg-card text-foreground hover:border-accent hover:bg-accent/10'
                }`}
              >
                {slotTimeLabel(iso, timezone)}
              </button>
            )
          })}
        </div>
      )}

      {bookError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {bookError}
        </p>
      )}
      {data?.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {data.error}
        </p>
      )}

      <Button
        type="button"
        disabled={!selectedSlot || booking}
        onClick={() => void confirmBooking()}
        className="h-12 bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90"
      >
        {booking ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Booking…
          </>
        ) : selectedSlot ? (
          `Confirm ${slotTimeLabel(selectedSlot, timezone)} call`
        ) : (
          'Pick a time to confirm'
        )}
      </Button>
    </div>
  )

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          All times shown in{' '}
          <span className="font-medium text-foreground">
            {timezoneLabel(timezone)}
          </span>
          . Wrong timezone? Change it here.
        </p>
        {timezonePicker}
      </div>

      {isLoading && !data ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-20">
          <Loader2
            className="size-8 animate-spin text-accent"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Loading available times…
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: calendar left, times right */}
          <div className="hidden gap-8 rounded-xl border border-border bg-card p-6 md:grid md:grid-cols-[1.15fr_1fr]">
            {calendarPane}
            {timesPane}
          </div>

          {/* Mobile: day step, then time step */}
          <div className="rounded-xl border border-border bg-card p-4 md:hidden">
            {mobileStep === 'day' ? calendarPane : timesPane}
          </div>
        </>
      )}
    </div>
  )
}
