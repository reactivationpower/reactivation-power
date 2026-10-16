// @ts-nocheck
import { useState } from 'react'
import { Link } from 'wouter'
import { FilePenLine, Send } from 'lucide-react'

import { AgreementActions } from '@/components/admin/agreement-actions'
import { AgreementFormDialog } from '@/components/admin/agreement-form-dialog'
import { AgreementStatusPill, formatUsd, formatWhen } from '@/components/agreements/agreement-document'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from '@/hooks/use-router'
import { retryCustomerEnrollment } from '@/app/actions/payments'
import { notifyDone, notifyError } from '@/lib/notify'

/** Service agreement status + controls on the customer record. */
export function AgreementCard({ linkId, agreement, offerType = 'subscription', enrollmentFlow = false }: { linkId: string; agreement: any | null; offerType?: 'subscription' | 'one_time'; enrollmentFlow?: boolean }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [retrying, setRetrying] = useState(false)
  async function retryInitial() {
    setRetrying(true)
    try {
      const res = await retryCustomerEnrollment(linkId)
      if (res.invitation?.status === 'provider_accepted') notifyDone('Provider accepted enrollment email', 'Inbox delivery is not yet confirmed.')
      else if (res.invitation?.status === 'failed') notifyError(res.invitation.error)
      else notifyDone('Enrollment email sending or pending', 'Check this saved record again.')
      router.refresh()
    } catch {
      notifyError('Could not retry the email. The customer and offer are still saved.')
    } finally {
      setRetrying(false)
    }
  }
  return (
    <Card data-testid="agreement-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePenLine className="size-4" /> Service agreement
        </CardTitle>
        {agreement ? <AgreementStatusPill status={agreement.status} /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {agreement ? (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
               {offerType === 'subscription' ? <>
                 <Item label="Term" value={`${agreement.term_months} months`} />
                 <Item label="Monthly" value={formatUsd(agreement.monthly_cents)} />
                 <Item label="Setup payment" value={agreement.setup_fee_cents > 0 ? formatUsd(agreement.setup_fee_cents) : 'Waived'} />
               </> : <Item label="Purchase price" value={formatUsd(agreement.setup_fee_cents)} />}
              <Item label="Version" value={`v${agreement.current_version}`} />
              <Item label="Sent" value={formatWhen(agreement.sent_at)} />
              <Item label="Viewed" value={formatWhen(agreement.viewed_at)} />
              <Item label="Signed" value={formatWhen(agreement.signed_at)} />
              <Item label="Completed" value={formatWhen(agreement.completed_at)} />
            </dl>
            <AgreementActions agreement={agreement} />
            <Link href={`/admin/agreements/${agreement.id}`} className="text-xs text-muted-foreground underline">
              Full agreement detail, versions and audit trail
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
               No agreement yet. Send the enrollment agreement before the customer confirms payment.
            </p>
            <div>
              {enrollmentFlow && <Button variant="outline" disabled={retrying} onClick={retryInitial} className="mr-2">
                {retrying ? 'Retrying…' : 'Retry automatic enrollment email'}
              </Button>}
              <Button onClick={() => setSending(true)} data-testid="send-agreement">
                 <Send className="size-4" /> Send Enrollment Email
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <AgreementFormDialog open={sending} onOpenChange={setSending} linkId={linkId} mode="send" onSaved={() => router.refresh()} />
    </Card>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}
