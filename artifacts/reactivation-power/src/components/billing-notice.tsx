import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Link } from 'wouter'

/**
 * Shown on the login page when portal access is shut off for a billing
 * problem. The link goes to the customer billing page where the owner can
 * update a card and settle the open invoice.
 */
export function BillingNotice({ reason, email }: { reason?: string | null; email?: string | null }) {
  const billingHref = email ? `/billing?email=${encodeURIComponent(email)}` : '/billing'
  return (
    <div
      role="alert"
      data-testid="billing-notice"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">Billing issue — access is paused</p>
          <p className="text-pretty text-amber-900">
            {reason?.trim() || 'Your most recent payment did not go through on either card on file.'}{' '}
            Portal access for your account and your team resumes automatically as soon as the balance is paid.
          </p>
          <Link
            href={billingHref}
            className="mt-1 inline-flex items-center gap-1 font-medium text-amber-900 underline underline-offset-4 hover:text-amber-950"
          >
            Update your card and pay the balance
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}
