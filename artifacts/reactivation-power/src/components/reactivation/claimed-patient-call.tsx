import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { claimPatientCall, renewPatientCall, releasePatientCall } from '@/app/actions/reactivation'
import { PageLoading } from '@/components/page-status'
import { CallScreen } from './call-screen'

// Strict Mode replays effects; share only within this tab, never between tabs.
const claims = new Map<string, { users: number; pending: Promise<any>; timer?: ReturnType<typeof setTimeout> }>()

export function ClaimedPatientCall({ data }: { data: any }) {
  const [claim, setClaim] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const saved = useRef(false)
  const id = data.contact.id
  useEffect(() => {
    let mounted = true
    let entry = claims.get(id)
    if (!entry) { entry = { users: 0, pending: claimPatientCall(id) }; claims.set(id, entry) }
    const current = entry
    current.users++
    if (current.timer) clearTimeout(current.timer)
    current.pending.then(result => {
      if (mounted) {
        if (result?.token) setClaim(result)
        else setError(result?.error ?? 'Unable to start this call.')
      }
    }).catch(e => { if (mounted) setError(String(e)) })
    const heartbeat = setInterval(async () => {
      if (saved.current) return
      try {
        const result = await current.pending
        if (!result?.token) return
        const renewed = await renewPatientCall(id, result.token)
        if (mounted && !renewed?.renewed) { setClaim(null); setError('Call session ended. Return to the dialer to reopen the patient.') }
      } catch { /* Server rejects stale tokens; retry brief network outages. */ }
    }, 30_000)
    const pagehide = () => {
      void current.pending.then(result => {
        if (!result?.token) return
        void fetch('/api/actions/reactivation/releasePatientCall', {
          method: 'POST', credentials: 'include', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [id, result.token] }),
        })
      })
    }
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) { setClaim(null); setError('Call session ended when you left this page. Reopen the patient from the dialer.') }
    }
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    return () => {
      mounted = false
      clearInterval(heartbeat)
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('pageshow', pageshow)
      current.users--
      current.timer = setTimeout(async () => {
        if (current.users) return
        try {
          const result = await current.pending
          if (result?.token) await releasePatientCall(id, result.token)
        } catch { /* An abandoned lease expires in two minutes. */ }
        finally { if (!current.users && claims.get(id) === current) claims.delete(id) }
      }, 300)
    }
  }, [id])
  if (error) return <div role="alert" className="rounded-lg border bg-card p-6">{error} <Link href="/portal/dialer" className="underline">Back to Dialer</Link></div>
  if (!claim) return <PageLoading />
  return <CallScreen key={id} contact={claim.contact} leaseToken={claim.token} callContext={claim.context} onCallSaved={() => { saved.current = true }}
    serviceLabel={claim.service.service_label ?? claim.service.niche_name ?? 'General'}
    niches={data.niches} scriptBody={data.script?.body ?? ''} sections={data.sections}
    initialNicheId={claim.service.niche_id ?? data.participant.selected_niche_id}
    nextContactId={data.nextContactId} callerName={data.participant.first_name}
    practiceName={data.owner?.practice_name ?? null} officePhone={data.owner?.office_phone ?? null}
    owner={data.owner} isProvider={data.participant.role === 'owner'} callHistory={data.callHistory}
    flowSteps={data.flow.steps} flowChoices={data.flow.choices} />
}
