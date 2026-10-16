import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as R from '@/app/actions/resellers'
import { AgreementFormDialog } from '@/components/admin/agreement-form-dialog'
import { Field, Section, StatusPill, Table, btn2Cls, fmtDate, inputCls, money } from '@/components/affiliates/shared'
import { QueryError, RForm, STAGES, Skeleton, TF } from '@/components/resellers/ui'

const toLocal = (s: string | null) => { if (!s) return ''; const d = new Date(s); if (isNaN(+d)) return ''; return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const toIso = (s: string) => new Date(s).toISOString()
const cents = (d: string) => Math.round(Number(d) * 100)
const FINAL = /signed|complete|cancel|void|expire|supersed/i
const reqKey = (id: string) => `reseller-offer-request:${id}`

export default function ResellerProspectPage() {
  const { id = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['reseller-prospect', id], queryFn: () => R.getProspect(id), placeholderData: (p) => p, staleTime: 0, refetchOnMount: 'always' })
  const refresh = async (msg?: string) => {
    if (msg) toast.success(msg)
    await Promise.all([qc.invalidateQueries({ queryKey: ['reseller-prospect', id] }), qc.invalidateQueries({ queryKey: ['reseller-workspace'] })])
  }
  const [e, setE] = useState<any>(null); const [initFor, setInitFor] = useState('')
  const p = q.data?.prospect
  useEffect(() => {
    if (p && initFor !== `${p.id}:${p.revision}`) {
      setInitFor(`${p.id}:${p.revision}`)
      setE({ fullName: p.full_name, businessName: p.business_name, email: p.email, phone: p.phone, businessAddress: p.business_address, consentEvidence: p.consent_evidence, stage: p.stage, salespersonId: p.salesperson_id, next: toLocal(p.next_followup_at), dnd: p.do_not_contact, reason: '' })
    }
  }, [p, initFor])
  const [log, setLog] = useState({ kind: 'note' as 'note' | 'call', notes: '', disposition: '', next: '' })
  const [offer, setOffer] = useState({ type: 'subscription' as 'subscription' | 'one_time', amount: '', monthly: '', businessAddress: '', phone: '', ownerName: '', ownerPhone: '', fullName: '', businessName: '' })
  const [offerInit, setOfferInit] = useState('')
  useEffect(() => {
    const d = q.data
    if (d && offerInit !== d.prospect.id) {
      setOfferInit(d.prospect.id)
      setOffer((o) => ({ ...o, fullName: d.prospect.full_name, businessName: d.prospect.business_name, businessAddress: d.prospect.business_address, phone: d.prospect.phone, ownerPhone: d.prospect.phone, ownerName: d.prospect.full_name,
        amount: d.prices ? (d.prices.lifetime_cents / 100).toFixed(2) : '', monthly: d.prices ? (d.prices.monthly_cents / 100).toFixed(2) : '' }))
    }
  }, [q.data, offerInit])
  const requestId = useRef<string | null>(null)
  const inFlight = useRef(false)
  const [offerNote, setOfferNote] = useState('')
  const [dialog, setDialog] = useState<{ linkId: string; agreementId: string | null; mode: 'send' | 'edit' } | null>(null)
  const [retrying, setRetrying] = useState('')

  if (q.isLoading) return <Skeleton />
  const d = q.data
  if (q.isError || !d || !p || !e) return <QueryError error={q.error} onRetry={() => q.refetch()} busy={q.isFetching} />
  const manager = d.actor.role === 'reseller_manager'
  const prices = d.prices
  const blocked = p.do_not_contact ? 'This prospect is marked Do Not Contact. Offers are closed.' : !prices ? 'Selling is unavailable until standard prices are configured.' : ''
  const callNeedsDate = log.kind === 'call' && log.disposition && !['Wrong Number', 'Do Not Contact'].includes(log.disposition)

  async function createOffer() {
    if (inFlight.current || !prices) return
    inFlight.current = true; setOfferNote('')
    requestId.current ??= sessionStorage.getItem(reqKey(id)) ?? crypto.randomUUID()
    sessionStorage.setItem(reqKey(id), requestId.current)
    const body = offer.type === 'subscription'
      ? { type: 'subscription', monthlyDollars: Number(offer.monthly), setupFeeDollars: prices.setup_cents / 100 }
      : { type: 'one_time', amountDollars: Number(offer.amount) }
    try {
      const res = await R.createOffer({ customer: { fullName: offer.fullName.trim(), businessName: offer.businessName.trim(), businessAddress: offer.businessAddress.trim(), phone: offer.phone.trim(), ownerName: offer.ownerName.trim(), ownerPhone: offer.ownerPhone.trim(), email: p!.email }, offer: body, requestId: requestId.current, resellerProspectId: id })
      if (!res.ok) { requestId.current = null; sessionStorage.removeItem(reqKey(id)); throw new Error(res.error ?? 'Could not create the offer.') }
      requestId.current = null; sessionStorage.removeItem(reqKey(id))
      await refresh(res.invitation?.status === 'failed' ? 'Offer saved; enrollment email failed. Retry below.' : 'Offer created. Enrollment email requested; no payment collected.')
    } catch (x) {
      if (requestId.current) setOfferNote('Response unavailable. Submit again to recover the same enrollment safely; do not start another one.')
      else throw x
    } finally { inFlight.current = false }
  }

  async function retry(linkId: string) {
    setRetrying(linkId)
    try { const r = await R.retryEnrollment(linkId); await refresh(r?.invitation?.error ? r.invitation.error : 'Enrollment retried') } catch (x) { toast.error((x as Error).message) } finally { setRetrying('') }
  }
  async function resend(agreementId: string) {
    try { const r = await R.resendAgreement(agreementId); if (r?.ok === false) throw new Error(r.error ?? 'Resend failed'); await refresh('Agreement resent') } catch (x) { toast.error((x as Error).message) }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/resellers" className="text-sm text-muted-foreground underline">All prospects</Link>
        <h1 className="mt-1 text-2xl font-semibold" data-testid="text-prospect-name">{p.full_name}</h1>
        <p className="text-sm text-muted-foreground">{p.business_name} | {p.email} | {p.phone} <StatusPill s={p.stage} /></p>
        {p.do_not_contact && <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-dnd">Do Not Contact is on. Do not call or email this person.</p>}
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>section]:min-w-0">
        <Section title="Prospect details" desc="Stage, assignment, follow-up and consent. Revision checks stop two people overwriting each other.">
          <RForm testid="button-save-prospect" submit="Save prospect" onSubmit={async () => {
            if (p.do_not_contact && !e.dnd && e.consentEvidence.trim() === p.consent_evidence.trim()) throw new Error('Enter fresh consent evidence to clear Do Not Contact.')
            await R.updateProspect(id, { revision: p.revision, fullName: e.fullName.trim(), businessName: e.businessName.trim(), email: e.email.trim(), phone: e.phone.trim(), businessAddress: e.businessAddress.trim(), consentEvidence: e.consentEvidence.trim(), stage: e.stage, doNotContact: e.dnd, nextFollowupAt: e.next ? toIso(e.next) : null, ...(e.salespersonId !== p.salesperson_id ? { salespersonId: e.salespersonId } : {}), reason: e.reason.trim() })
            await refresh('Prospect saved')
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TF l="Contact name" v={e.fullName} set={(v) => setE({ ...e, fullName: v })} id="input-edit-name" />
              <TF l="Business" v={e.businessName} set={(v) => setE({ ...e, businessName: v })} id="input-edit-business" />
              <TF l="Email" t="email" v={e.email} set={(v) => setE({ ...e, email: v })} id="input-edit-email" />
              <TF l="Phone" t="tel" v={e.phone} set={(v) => setE({ ...e, phone: v })} id="input-edit-phone" />
            </div>
            <TF l="Business address" req={false} v={e.businessAddress} set={(v) => setE({ ...e, businessAddress: v })} id="input-edit-address" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Stage"><select className={inputCls} value={e.stage} onChange={(ev) => setE({ ...e, stage: ev.target.value })} data-testid="select-stage">{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <TF l="Next follow-up" t="datetime-local" req={false} v={e.next} set={(v) => setE({ ...e, next: v })} id="input-edit-next" />
            </div>
            {manager && d.members.length > 0 && <Field label="Assigned salesperson"><select className={inputCls} value={e.salespersonId} onChange={(ev) => setE({ ...e, salespersonId: ev.target.value })} data-testid="select-assignee">{d.members.filter((m) => m.active || m.user_id === p.salesperson_id).map((m) => <option key={m.user_id} value={m.user_id}>{m.name}{m.active ? '' : ' (inactive)'}</option>)}</select></Field>}
            <Field label="Consent evidence" hint="Required fresh to clear Do Not Contact."><textarea rows={2} className={inputCls} value={e.consentEvidence} onChange={(ev) => setE({ ...e, consentEvidence: ev.target.value })} data-testid="input-edit-consent" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.dnd} onChange={(ev) => setE({ ...e, dnd: ev.target.checked })} data-testid="check-dnd" />Do Not Contact</label>
            <TF l="Reason for change (audited)" v={e.reason} set={(v) => setE({ ...e, reason: v })} id="input-edit-reason" />
          </RForm>
        </Section>

        <Section title="Log a note or call" desc="Record outside contact. Calls need an outcome and a next follow-up unless the number is wrong or they asked not to be contacted.">
          <RForm testid="button-log" submit="Save to timeline" onSubmit={async () => {
            await R.logFollowup(id, { kind: log.kind, notes: log.notes.trim(), ...(log.kind === 'call' ? { disposition: log.disposition || undefined } : {}), ...(log.next && log.kind === 'call' ? { nextFollowupAt: toIso(log.next) } : {}) })
            setLog({ kind: 'note', notes: '', disposition: '', next: '' }); await refresh('Saved')
          }}>
            <Field label="Type"><select className={inputCls} value={log.kind} onChange={(ev) => setLog({ ...log, kind: ev.target.value as 'note' | 'call' })} data-testid="select-log-kind"><option value="note">Note</option><option value="call">Call</option></select></Field>
            {log.kind === 'call' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Outcome"><select required className={inputCls} value={log.disposition} onChange={(ev) => setLog({ ...log, disposition: ev.target.value })} data-testid="select-disposition"><option value="">Choose outcome</option>{['Connected', 'No Answer', 'Voicemail', 'Demo Scheduled', 'Wrong Number', 'Do Not Contact'].map((s) => <option key={s}>{s}</option>)}</select></Field>
                <TF l="Next follow-up" t="datetime-local" req={Boolean(callNeedsDate)} v={log.next} set={(v) => setLog({ ...log, next: v })} id="input-log-next" />
              </div>
            )}
            <Field label="Notes"><textarea required rows={3} maxLength={3000} className={inputCls} value={log.notes} onChange={(ev) => setLog({ ...log, notes: ev.target.value })} data-testid="input-log-notes" /></Field>
          </RForm>
        </Section>
      </div>

      <Section title="Offers and enrollment" desc="Approved offers email the customer an agreement to sign. No payment is collected here.">
        <div className="space-y-6">
          <Table empty="No offers yet." head={['Offer', 'Status', 'Enrollment email', 'Agreement', 'Actions']}
            rows={d.offers.map((o: any) => [
              o.type === 'one_time' ? `Lifetime ${money(Number(o.amount_cents))}` : `${money(Number(o.monthly_cents))}/mo + ${money(Number(o.setup_fee_cents))} setup`,
              <span>{o.completed_at ? 'Completed' : 'In progress'}<span className="block text-xs text-muted-foreground">{o.status}</span></span>,
              o.invitation_status ? <StatusPill s={o.invitation_status} /> : '-', o.agreement_status ? <StatusPill s={o.agreement_status} /> : 'Not sent',
              <div className="flex flex-wrap gap-2">
                {o.invitation_status && o.invitation_status !== 'accepted' && <button className={btn2Cls} disabled={retrying === o.link_id} data-testid={`button-retry-${o.link_id}`} onClick={() => void retry(o.link_id)}>{retrying === o.link_id ? 'Retrying...' : 'Retry enrollment'}</button>}
                {!o.agreement_id && <button className={btn2Cls} data-testid={`button-send-agreement-${o.link_id}`} onClick={() => setDialog({ linkId: o.link_id, agreementId: null, mode: 'send' })}>Send agreement</button>}
                {o.agreement_id && !FINAL.test(o.agreement_status ?? '') && <>
                  <button className={btn2Cls} data-testid={`button-edit-agreement-${o.link_id}`} onClick={() => setDialog({ linkId: o.link_id, agreementId: o.agreement_id, mode: 'edit' })}>Preview / edit</button>
                  <button className={btn2Cls} data-testid={`button-resend-agreement-${o.link_id}`} onClick={() => void resend(o.agreement_id)}>Resend</button>
                </>}
              </div>])} />
          {blocked ? <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm" data-testid="text-offer-blocked">{blocked}</p> : prices && (
            <RForm testid="button-create-offer" submit="Create approved offer" onSubmit={createOffer}>
              <p className="text-sm font-medium">New offer</p>
              <Field label="Offer type"><select className={inputCls} value={offer.type} onChange={(ev) => setOffer({ ...offer, type: ev.target.value as 'subscription' | 'one_time' })} data-testid="select-offer-type"><option value="subscription">Monthly subscription</option><option value="one_time">Lifetime</option></select></Field>
              {offer.type === 'one_time' ? (
                <TF l="Lifetime price (USD)" h={`Standard ${money(prices.lifetime_cents)}. Up to $1,000 off, never above standard.`} t="number" v={offer.amount} set={(v) => setOffer({ ...offer, amount: v })} id="input-offer-amount" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TF l="Monthly price (USD)" h={`Standard ${money(prices.monthly_cents)}. Up to $100 off, never above standard.`} t="number" v={offer.monthly} set={(v) => setOffer({ ...offer, monthly: v })} id="input-offer-monthly" />
                  <Field label="Setup fee (USD)" hint="Owner-controlled. Cannot be discounted or waived."><input readOnly className={inputCls + ' bg-muted'} value={(prices.setup_cents / 100).toFixed(2)} data-testid="input-offer-setup" /></Field>
                </div>
              )}
              {offer.type === 'one_time' ? null : Number.isFinite(cents(offer.monthly)) && cents(offer.monthly) < prices.monthly_cents && <p className="text-xs text-muted-foreground">Discount: {money(prices.monthly_cents - cents(offer.monthly))}/mo</p>}
              <p className="pt-2 text-sm font-medium">Customer</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <TF l="Customer name" v={offer.fullName} set={(v) => setOffer({ ...offer, fullName: v })} id="input-offer-name" />
                <TF l="Business name" v={offer.businessName} set={(v) => setOffer({ ...offer, businessName: v })} id="input-offer-business" />
                <Field label="Email" hint="Taken from the prospect. Edit the prospect to change it."><input readOnly className={inputCls + ' bg-muted'} value={p.email} data-testid="input-offer-email" /></Field>
                <TF l="Phone" t="tel" v={offer.phone} set={(v) => setOffer({ ...offer, phone: v })} id="input-offer-phone" />
                <TF l="Owner name" v={offer.ownerName} set={(v) => setOffer({ ...offer, ownerName: v })} id="input-offer-owner" />
                <TF l="Owner phone" t="tel" v={offer.ownerPhone} set={(v) => setOffer({ ...offer, ownerPhone: v })} id="input-offer-owner-phone" />
              </div>
              <TF l="Business address" v={offer.businessAddress} set={(v) => setOffer({ ...offer, businessAddress: v })} id="input-offer-address" />
              {offerNote && <p role="status" className="text-sm text-destructive" data-testid="text-offer-recover">{offerNote}</p>}
            </RForm>
          )}
        </div>
      </Section>

      <Section title="Timeline" desc="Notes, call outcomes and changes on this prospect.">
        <Table empty="Nothing logged yet." head={['When', 'Action', 'Outcome', 'Next follow-up', 'Notes']}
          rows={d.activity.map((a) => [fmtDate(a.occurred_at), a.action.replace(/_/g, ' '),
            a.details?.disposition ?? '-', a.details?.nextFollowupAt ? fmtDate(a.details.nextFollowupAt) : '-', a.reason ?? '-'])} />
      </Section>

      {dialog && (
        <AgreementFormDialog reseller open onOpenChange={(o: boolean) => { if (!o) setDialog(null) }} linkId={dialog.linkId} agreementId={dialog.agreementId} mode={dialog.mode} onSaved={() => { void refresh() }} />
      )}
    </div>
  )
}
