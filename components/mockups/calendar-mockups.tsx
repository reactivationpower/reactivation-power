'use client'

import { useMemo, useState } from 'react'

/* ------------------------------------------------------------------ */
/* Shared sample data: one continuous 45-day window, ~55% bookable     */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000

interface MockDay {
  key: string
  dayOfMonth: number
  monthShort: string // "Aug"
  monthLong: string // "August"
  isNewMonth: boolean
  weekday: number // 0-6
  isPast: boolean
  slotCount: number // 0 = unavailable
}

function buildDays(): MockDay[] {
  const now = new Date()
  const days: MockDay[] = []
  let prevMonth = ''
  for (let i = -3; i < 45; i++) {
    const d = new Date(now.getTime() + i * DAY_MS)
    const monthShort = d.toLocaleDateString('en-US', { month: 'short' })
    const monthLong = d.toLocaleDateString('en-US', { month: 'long' })
    // Deterministic pseudo-availability: most weekdays bookable, some not
    const wd = d.getDay()
    const seed = (d.getDate() * 3 + wd * 11) % 10
    const bookable = i >= 0 && wd !== 0 && wd !== 6 && seed >= 3
    days.push({
      key: d.toISOString().slice(0, 10),
      dayOfMonth: d.getDate(),
      monthShort,
      monthLong,
      isNewMonth: monthShort !== prevMonth,
      weekday: wd,
      isPast: i < 0,
      slotCount: bookable ? (seed % 5) + 3 : 0,
    })
    prevMonth = monthShort
  }
  return days
}

/** Group continuous days into calendar weeks (rows of 7, Sun-Sat) */
function buildWeeks(days: MockDay[]): (MockDay | null)[][] {
  const weeks: (MockDay | null)[][] = []
  let week: (MockDay | null)[] = new Array(days[0].weekday).fill(null)
  for (const d of days) {
    week.push(d)
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

const WEEKDAY_HEADER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function WeekdayHeader() {
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {WEEKDAY_HEADER.map((d, i) => (
        <span
          key={`${d}-${i}`}
          className="pb-1 text-xs font-medium text-muted-foreground"
          aria-hidden="true"
        >
          {d}
        </span>
      ))}
    </div>
  )
}

function MockupCard({
  number,
  title,
  blurb,
  children,
}: {
  number: number
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {number}
          </span>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Continuous Flow — one unbroken grid, tiny month tag on the 1st   */
/* ------------------------------------------------------------------ */

function ContinuousFlow({ days }: { days: MockDay[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const weeks = useMemo(() => buildWeeks(days), [days])
  return (
    <div className="flex flex-col gap-1">
      <WeekdayHeader />
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((d, di) =>
            d === null ? (
              <span key={`b-${di}`} aria-hidden="true" />
            ) : (
              <button
                key={d.key}
                type="button"
                disabled={d.slotCount === 0}
                onClick={() => setPicked(d.key)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-md text-sm transition-colors ${
                  picked === d.key
                    ? 'bg-accent font-semibold text-accent-foreground'
                    : d.slotCount > 0
                      ? 'bg-accent/10 font-semibold text-accent hover:bg-accent/20'
                      : 'font-normal text-muted-foreground/40'
                }`}
              >
                {d.isNewMonth && (
                  <span
                    className={`absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wide ${
                      picked === d.key ? 'text-accent-foreground/80' : 'text-accent'
                    }`}
                  >
                    {d.monthShort}
                  </span>
                )}
                {d.dayOfMonth}
              </button>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Circle Days — Google-style circles, whisper-thin month rule      */
/* ------------------------------------------------------------------ */

function CircleDays({ days }: { days: MockDay[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  // Month segments but with a minimal one-word divider
  const segments = useMemo(() => {
    const segs: { month: string; days: MockDay[] }[] = []
    for (const d of days) {
      const last = segs[segs.length - 1]
      if (!last || last.month !== d.monthLong) {
        segs.push({ month: d.monthLong, days: [d] })
      } else {
        last.days.push(d)
      }
    }
    return segs
  }, [days])

  return (
    <div className="flex flex-col gap-2">
      <WeekdayHeader />
      {segments.map((seg, si) => (
        <div key={seg.month} className="flex flex-col gap-1">
          {si > 0 && (
            <p className="pl-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {seg.month}
            </p>
          )}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: seg.days[0].weekday }).map((_, j) => (
              <span key={`blank-${j}`} aria-hidden="true" />
            ))}
            {seg.days.map((d) => (
              <div key={d.key} className="flex aspect-square items-center justify-center">
                <button
                  type="button"
                  disabled={d.slotCount === 0}
                  onClick={() => setPicked(d.key)}
                  className={`flex size-9 items-center justify-center rounded-full text-sm transition-all ${
                    picked === d.key
                      ? 'bg-accent font-bold text-accent-foreground'
                      : d.slotCount > 0
                        ? 'font-semibold text-foreground ring-2 ring-inset ring-accent hover:bg-accent/15'
                        : 'font-normal text-muted-foreground/40'
                  }`}
                >
                  {d.dayOfMonth}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Month Rail — unbroken weeks, months labeled in a left rail       */
/* ------------------------------------------------------------------ */

function MonthRail({ days }: { days: MockDay[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const weeks = useMemo(() => buildWeeks(days), [days])

  /** Label a week with its month only when the month changes */
  const railLabels = useMemo(() => {
    let prev = ''
    return weeks.map((week) => {
      const firstReal = week.find((d) => d !== null)
      if (!firstReal) return ''
      const label = firstReal.monthShort
      if (label !== prev) {
        prev = label
        return label
      }
      // A month starting mid-week: label the week where the 1st lives
      const newMonthDay = week.find((d) => d?.isNewMonth)
      if (newMonthDay && newMonthDay.monthShort !== label) {
        prev = newMonthDay.monthShort
        return newMonthDay.monthShort
      }
      return ''
    })
  }, [weeks])

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[2rem_1fr] gap-2">
        <span aria-hidden="true" />
        <WeekdayHeader />
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-[2rem_1fr] items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-accent"
            aria-hidden="true"
          >
            {railLabels[wi]}
          </span>
          <div className="grid grid-cols-7 gap-1">
            {week.map((d, di) =>
              d === null ? (
                <span key={`b-${di}`} aria-hidden="true" />
              ) : (
                <button
                  key={d.key}
                  type="button"
                  disabled={d.slotCount === 0}
                  onClick={() => setPicked(d.key)}
                  className={`flex aspect-square flex-col items-center justify-center gap-0 rounded-md text-sm transition-colors ${
                    picked === d.key
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : d.slotCount > 0
                        ? 'bg-success/10 font-semibold text-foreground hover:bg-success/20'
                        : 'text-muted-foreground/40'
                  }`}
                >
                  {d.dayOfMonth}
                  {d.slotCount > 0 && picked !== d.key && (
                    <span className="text-[9px] font-medium leading-none text-success">
                      {d.slotCount} open
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Underline Marker — bold day + accent bar, shaded month bands     */
/* ------------------------------------------------------------------ */

function UnderlineMarker({ days }: { days: MockDay[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const weeks = useMemo(() => buildWeeks(days), [days])

  return (
    <div className="flex flex-col gap-1">
      <WeekdayHeader />
      {weeks.map((week, wi) => {
        const monthStart = week.find((d) => d?.isNewMonth && d.dayOfMonth === 1)
        return (
          <div key={wi} className="flex flex-col gap-1">
            {monthStart && (
              <div className="flex items-center gap-2 py-0.5">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                  {monthStart.monthLong}
                </span>
              </div>
            )}
            <div className="grid grid-cols-7 gap-1">
              {week.map((d, di) =>
                d === null ? (
                  <span key={`b-${di}`} aria-hidden="true" />
                ) : (
                  <button
                    key={d.key}
                    type="button"
                    disabled={d.slotCount === 0}
                    onClick={() => setPicked(d.key)}
                    className={`group flex aspect-square flex-col items-center justify-center gap-1 rounded-md text-sm transition-colors ${
                      picked === d.key
                        ? 'bg-accent font-bold text-accent-foreground'
                        : d.slotCount > 0
                          ? 'font-bold text-foreground hover:bg-accent/10'
                          : 'font-normal text-muted-foreground/40'
                    }`}
                  >
                    {d.dayOfMonth}
                    <span
                      className={`h-1 w-5 rounded-full transition-colors ${
                        picked === d.key
                          ? 'bg-accent-foreground/70'
                          : d.slotCount > 0
                            ? 'bg-accent group-hover:bg-accent'
                            : 'bg-transparent'
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                ),
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 5. Filled Cards — bookable days are raised cards, rest are ghosts   */
/* ------------------------------------------------------------------ */

function FilledCards({ days }: { days: MockDay[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const weeks = useMemo(() => buildWeeks(days), [days])
  let lastMonth = ''

  return (
    <div className="flex flex-col gap-1.5">
      <WeekdayHeader />
      {weeks.map((week, wi) => {
        const firstOfMonth = week.find((d) => d?.isNewMonth)
        const showTag = firstOfMonth && firstOfMonth.monthShort !== lastMonth
        if (showTag && firstOfMonth) lastMonth = firstOfMonth.monthShort
        return (
          <div key={wi} className="relative grid grid-cols-7 gap-1.5">
            {showTag && firstOfMonth && wi > 0 && (
              <span
                className="absolute -left-1 -top-2 z-10 rounded bg-accent px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-accent-foreground"
                aria-hidden="true"
              >
                {firstOfMonth.monthShort}
              </span>
            )}
            {week.map((d, di) =>
              d === null ? (
                <span key={`b-${di}`} aria-hidden="true" />
              ) : (
                <button
                  key={d.key}
                  type="button"
                  disabled={d.slotCount === 0}
                  onClick={() => setPicked(d.key)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-all ${
                    picked === d.key
                      ? 'border border-accent bg-accent font-bold text-accent-foreground shadow-md'
                      : d.slotCount > 0
                        ? 'border border-accent/30 bg-background font-semibold text-foreground shadow-sm hover:-translate-y-px hover:border-accent hover:shadow-md'
                        : 'border border-transparent font-normal text-muted-foreground/35'
                  }`}
                >
                  {d.dayOfMonth}
                </button>
              ),
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function CalendarMockups() {
  const days = useMemo(() => buildDays(), [])

  return (
    <div className="mx-auto mt-10 grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
      <MockupCard
        number={1}
        title="Continuous Flow"
        blurb="One unbroken grid — no dividers at all. The month change is a tiny label tucked inside the 1st of the month. Bookable days get a soft teal fill; everything else fades back."
      >
        <ContinuousFlow days={days} />
      </MockupCard>

      <MockupCard
        number={2}
        title="Circle Days"
        blurb="Scheduler-style circles: bookable days wear a teal ring you can spot instantly, and the selected day fills solid. Months are separated by a single whisper-quiet word — no lines."
      >
        <CircleDays days={days} />
      </MockupCard>

      <MockupCard
        number={3}
        title="Month Rail"
        blurb="Weeks run continuously with month names in a slim left rail, so the calendar never breaks apart. Bookable days show a green tint plus how many times are open."
      >
        <MonthRail days={days} />
      </MockupCard>

      <MockupCard
        number={4}
        title="Underline Marker"
        blurb="Bookable days are bold with a teal underline bar — like a highlighted date in a planner. The new month appears as a small pill chip in the flow, nothing heavier."
      >
        <UnderlineMarker days={days} />
      </MockupCard>

      <MockupCard
        number={5}
        title="Filled Cards"
        blurb="Bookable days are raised cards that lift on hover; unavailable days are ghosts with no box at all — maximum contrast between the two. The month change is a tiny teal tag pinned to the week where it starts."
      >
        <FilledCards days={days} />
      </MockupCard>

      <section className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-base font-semibold text-foreground">
          Which one feels right?
        </p>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          Pick a favorite (or a combination — e.g. &quot;layout 1 with the
          circles from 2&quot;) and it gets applied to the live booking page.
        </p>
      </section>
    </div>
  )
}
