'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  bookStrategyCall,
  getAvailability,
  type AvailabilityResult,
} from '@/app/actions/booking'
import { Button } from '@/components/ui/button'
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Globe,
  Loader2,
} from 'lucide-react'

/**
 * US timezones, covering every DST wrinkle: Arizona (no DST), Hawaii
 * (no DST), Alaska. IANA zone names handle daylight saving automatically.
 */
const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
] as const

const PAST_DAYS_SHOWN = 3
const WINDOW_DAYS = 45
const DAY_MS = 24 * 60 * 60 * 1000

/** Detect the visitor's timezone, mapped onto our US list (default ET). */
function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (US_TIMEZONES.some((z) => z.value === tz)) return tz
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
  return 'America/New_York'
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
  monthLabel: string // e.g. "August 2026"
  isPast: boolean
}

/** Build the rolling window and group it into month segments */
function buildMonthSegments(tz: string): {
  monthLabel: string
  leadingBlanks: number
  days: DayCell[]
}[] {
  const now = Date.now()
  const cells: DayCell[] = []
  const seen = new Set<string>()
  for (let i = -PAST_DAYS_SHOWN; i < WINDOW_DAYS; i++) {
    const ms = now + i * DAY_MS
    const key = dayKey(ms, tz)
    if (seen.has(key)) continue // DST fold safety
    seen.add(key)
    cells.push({
      key,
      ms,
      dayOfMonth: Number(key.slice(8, 10)),
      monthLabel: new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        month: 'long',
        year: 'numeric',
      }).format(new Date(ms)),
      isPast: i < 0,
    })
  }

  const segments: {
    monthLabel: string
    leadingBlanks: number
    days: DayCell[]
  }[] = []
  for (const cell of cells) {
    const last = segments[segments.length - 1]
    if (!last || last.monthLabel !== cell.monthLabel) {
      segments.push({
        monthLabel: cell.monthLabel,
        leadingBlanks: weekdayIndex(cell.ms, tz),
        days: [cell],
      })
    } else {
      last.days.push(cell)
    }
  }
  return segments
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
  firstName,
}: {
  contactId: string
  firstName?: string
}) {
  const [timezone, setTimezone] = useState<string>(() => detectTimezone())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [mobileStep, setMobileStep] = useState<'day' | 'time'>('day')
  const [booking, setBooking] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)

  const { data, isLoading } = useSWR<AvailabilityResult>(
    ['ghl-availability', timezone],
    () => getAvailability(timezone),
    { revalidateOnFocus: false, keepPreviousData: true },
  )

  const slots = data?.slots ?? {}
  const segments = useMemo(() => buildMonthSegments(timezone), [timezone])

  const firstAvailableDay = useMemo(() => {
    for (const seg of segments) {
      for (const d of seg.days) {
        if (!d.isPast && (slots[d.key]?.length ?? 0) > 0) return d.key
      }
    }
    return null
  }, [segments, slots])

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
    setBooking(false)
    if (res.ok) {
      setConfirmed(selectedSlot)
    } else {
      setBookError(res.error ?? 'Something went wrong. Please try again.')
    }
  }

  // ------- Confirmed state -------
  if (confirmed) {
    return (
      <div className="flex w-full flex-col items-center gap-5 rounded-xl border border-border bg-card px-6 py-14 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-9 text-success" aria-hidden="true" />
        </span>
        <h2 className="text-2xl font-bold text-foreground">
          {firstName ? `${firstName}, you're booked!` : "You're booked!"}
        </h2>
        <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
          Your strategy call is confirmed for{' '}
          <span className="font-semibold text-foreground">
            {new Intl.DateTimeFormat('en-US', {
              timeZone: timezone,
              dateStyle: 'full',
              timeStyle: 'short',
            }).format(new Date(confirmed))}
          </span>{' '}
          ({US_TIMEZONES.find((z) => z.value === timezone)?.label}). Check
          your email for the details — we look forward to talking with you.
        </p>
      </div>
    )
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
    <div className="flex flex-col gap-4">
      {segments.map((seg, i) => (
        <div key={seg.monthLabel} className="flex flex-col gap-2">
          {/* Month divider indicator — no button pressing to change months */}
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-foreground">
              {seg.monthLabel}
            </p>
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          {i === 0 && (
            <div className="grid grid-cols-7 gap-1 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, j) => (
                <span
                  key={`${d}-${j}`}
                  className="text-xs font-medium text-muted-foreground"
                  aria-hidden="true"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: seg.leadingBlanks }).map((_, j) => (
              <span key={`blank-${j}`} aria-hidden="true" />
            ))}
            {seg.days.map((d) => {
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
                  className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : bookable
                        ? 'bg-card font-medium text-foreground ring-1 ring-inset ring-border hover:bg-accent/10'
                        : 'text-muted-foreground/50'
                  }`}
                >
                  {d.dayOfMonth}
                  {bookable && !isActive && (
                    <span
                      className="size-1 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  )}
                </button>
              )
            })}
          </div>
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
            : 'Select a date with a dot to see available times.'}
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
            {US_TIMEZONES.find((z) => z.value === timezone)?.label}
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
