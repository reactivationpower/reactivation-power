import { useState } from 'react'
import { Link } from 'wouter'
import { track } from '@/lib/marketing-tracker'

/** Internal instrumentation test page. Emits telemetry only; never fabricates leads, bookings or payments. */
export default function AnalyticsTestPage() {
  const [sent, setSent] = useState(0)
  return (
    <main className="mx-auto min-h-[60dvh] max-w-xl space-y-6 px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Internal instrumentation test</p>
      <h1 className="text-2xl font-semibold">Analytics instrumentation test</h1>
      <p className="text-sm text-muted-foreground">For staff verifying tracking. Visits here are recorded in the test funnel. Nothing on this page creates a lead, booking or payment.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/schedule-a-call" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted" data-testid="link-test-schedule">Go to Schedule a call</Link>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" data-testid="button-test-cta"
          onClick={() => { track('cta', { control: 'test-cta' }); setSent((n) => n + 1) }}>Send test CTA event</button>
      </div>
      {sent > 0 && <p role="status" className="text-sm text-muted-foreground">Queued {sent} test CTA event{sent === 1 ? '' : 's'} (sent only if analytics consent allows).</p>}
    </main>
  )
}
