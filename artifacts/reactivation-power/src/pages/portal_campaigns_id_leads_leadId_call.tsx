import { useEffect, useState } from 'react'
import { Link, useParams } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { LeadCallScreen } from '@/components/lead-followup/lead-call-screen'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'
import { claimLeadCall, renewLeadCall, releaseLeadCall, releaseLeadCallOnPageHide } from '@/app/actions/lead-followup'

// Keep one lease for a mounted browser tab, including React's strict-mode
// effect setup/cleanup replay. The server still enforces exclusivity.
const activeClaims = new Map<string, {
  users: number; pending: Promise<any>; token?: string; timer?: ReturnType<typeof setTimeout>
  leavingPage?: boolean; pagehideSent?: boolean
}>()

function sendPagehideRelease(leadId: string, entry: NonNullable<ReturnType<typeof activeClaims.get>>) {
  if (entry.token && !entry.pagehideSent) {
    entry.pagehideSent = true
    releaseLeadCallOnPageHide(leadId, entry.token)
  }
}

// An SPA navigation unmounts ClaimedCall before the browser's eventual
// pagehide. Keep the unload listener while the claim/release is in flight,
// including the short Strict Mode cleanup grace period.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [leadId, entry] of activeClaims) {
      entry.leavingPage = true
      sendPagehideRelease(leadId, entry)
    }
  })
}

function ClaimedCall({ data }: { data: any }) {
  const [token, setToken] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const { participant, campaign, lead, niche, owner, flow, calls, nextHref, now } = data
  useEffect(() => {
    let mounted = true
    let claim = activeClaims.get(lead.id)
    if (!claim) {
      claim = { users: 0, pending: claimLeadCall(lead.id) }
      activeClaims.set(lead.id, claim)
    }
    claim.users++
    if (claim.timer) clearTimeout(claim.timer)
    const entry = claim
    entry.pending.then(result => {
      if (result?.token) entry.token = result.token
      if (entry.leavingPage && result?.token) {
        sendPagehideRelease(lead.id, entry)
        return
      }
      if (mounted) {
        if (result?.token) setToken(result.token)
        else setClaimError(result?.error ?? 'Unable to start this call.')
      }
    }).catch(error => { if (mounted) setClaimError(String(error)) })
    const onPageShow = (event: PageTransitionEvent) => {
      // A page restored from the back/forward cache has already released its
      // claim. Do not let it display a stale script or log with a stale token.
      if (event.persisted) {
        setToken(null)
        setClaimError('Call session ended when you left this page. Return to Calls Now to reopen it.')
      }
    }
    window.addEventListener('pageshow', onPageShow)
    const heartbeat = window.setInterval(async () => {
      if (entry.leavingPage || !entry.token) return
      try {
        const result = await renewLeadCall(lead.id, entry.token)
        if (mounted && !result?.renewed) { setToken(null); setClaimError('Call session expired. Return to Calls Now to reopen it.') }
      } catch {
        // A brief network interruption does not grant another user access;
        // the next heartbeat retries. The server rejects stale logging.
      }
    }, 30_000)
    return () => {
      mounted = false
      clearInterval(heartbeat)
      window.removeEventListener('pageshow', onPageShow)
      entry.users--
      entry.timer = setTimeout(async () => {
        if (entry.users) return
        try {
          const result = await entry.pending
          if (result?.token) await releaseLeadCall(lead.id, result.token)
        } catch { /* lease expires within two minutes if the release cannot be delivered */ }
        finally {
          if (!entry.users && activeClaims.get(lead.id) === entry) activeClaims.delete(lead.id)
        }
      }, 300)
    }
  }, [lead.id])
  if (claimError) return <div role="alert" className="mt-5 rounded-md border border-border bg-card p-5">{claimError} <Link href="/portal/leads?view=calls" className="font-semibold underline">Back to Calls Now</Link></div>
  if (!token) return <PageLoading />
  return <LeadCallScreen key={lead.id} leaseToken={token} campaign={campaign} lead={lead} niche={niche}
    callerName={participant.first_name} practiceName={owner?.practice_name ?? null}
    officePhone={owner?.office_phone ?? null} owner={owner ?? null}
    isProvider={participant.role === 'owner'} calls={calls} flowSteps={flow.steps}
    flowChoices={flow.choices} nextHref={nextHref} now={now} />
}

export default function LeadCallPage() {
  const { id, leadId } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}/leads/${leadId}/call`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { campaign, lead } = data

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href={`/portal/campaigns/${campaign.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
      </Link>

      <div className="mt-4">
        <ClaimedCall data={data} />
      </div>
    </div>
  )
}
