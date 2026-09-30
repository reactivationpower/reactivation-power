// @ts-nocheck
import { useParams } from 'wouter';
import { Link } from "wouter";
import { ArrowLeft, Lock } from 'lucide-react'
import { CallScreen } from '@/components/reactivation/call-screen'
import { nicheDisplayLabel } from '@/components/reactivation/niche-select'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function CallPage() {
  const params = useParams();
  const { contactId } = params
  const { data, loading, error, notFound } = usePageData<any>(`/portal/dialer/call/${contactId}`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const {
    participant, contact, niches, script, sections, owner, callHistory,
    flow, nextContactId, nicheInactive,
  } = data

  // Block calling when the contact's niche isn't active on the account —
  // loading a fallback script would risk running the wrong script live.
  if (nicheInactive) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <Link
          href="/portal/dialer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Dialer
        </Link>
        <div className="mt-6 rounded-lg border-2 border-destructive bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h1 className="text-lg font-semibold text-destructive">
                {nicheDisplayLabel(contact.niche.name)}
                {' isn\u2019t active on this account'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {contact.name} was imported for the{' '}
                <span className="font-semibold">{nicheDisplayLabel(contact.niche.name)}</span>{' '}
                script, but that niche isn&apos;t turned on for your account
                yet. To protect your call, we won&apos;t load a different
                script.
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                Contact the Reactivation Power team to turn on{' '}
                {nicheDisplayLabel(contact.niche.name)}. Once it&apos;s active, {contact.name} will
                automatically be ready to call with the right script — no
                re-import needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href="/portal/dialer"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dialer
      </Link>

      <div className="mt-4">
        <CallScreen
          contact={contact}
          niches={niches}
          scriptBody={script?.body ?? ''}
          sections={sections}
          initialNicheId={
            contact.niche_id ?? participant.selected_niche_id ?? null
          }
          nextContactId={nextContactId}
          callerName={participant.first_name}
          practiceName={owner?.practice_name ?? null}
          officePhone={owner?.office_phone ?? null}
          owner={owner ?? null}
          isProvider={participant.role === 'owner'}
          callHistory={callHistory}
          flowSteps={flow.steps}
          flowChoices={flow.choices}
        />
      </div>
    </div>
  )
}
