import type { Metadata } from 'next'
import { CalendarMockups } from '@/components/mockups/calendar-mockups'

export const metadata: Metadata = {
  title: 'Calendar Layout Mockups — Reactivation Power',
  robots: { index: false, follow: false },
}

export default function CowPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 md:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          Internal mockups
        </p>
        <h1 className="text-3xl font-bold text-foreground">
          Booking Calendar Layouts
        </h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Five concepts for the book-a-call calendar, all using the same
          45-day rolling window and sample availability. Every concept uses a
          smaller month treatment and a clearer &quot;this day is bookable&quot;
          signal. Click around — days are interactive so you can feel the
          selected state.
        </p>
      </div>
      <CalendarMockups />
    </main>
  )
}
