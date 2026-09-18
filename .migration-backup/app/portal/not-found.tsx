import Link from 'next/link'
import { PhoneCall, Users } from 'lucide-react'
import { PORTAL_WIDTH } from '@/lib/portal-layout'

/**
 * Rendered inside the portal layout (header, nav, and demo bar stay put) when
 * a portal page calls notFound(). Most often the link pointed at a patient or
 * call that has since been removed, or, in the demo account, at a record from
 * before the daily rebuild.
 */
export default function PortalNotFound() {
  return (
    <div className={`${PORTAL_WIDTH} py-16`}>
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          Page not found
        </p>
        <h1 className="mt-3 text-balance text-2xl font-bold text-foreground">
          We couldn&apos;t find that record
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          The patient or call this link pointed to is no longer here. It may
          have been removed, or the link may be from an older session.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/portal/dialer"
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <PhoneCall className="size-4" />
            Go to Dialer
          </Link>
          <Link
            href="/portal/contacts"
            className="flex items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Users className="size-4" />
            View Contacts
          </Link>
        </div>
      </div>
    </div>
  )
}
