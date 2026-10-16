// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import { useAgreementDisplayAcknowledgment } from '@/hooks/use-agreement-display-acknowledgment'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Loader2, Download } from 'lucide-react'
import {
  confirmEnrollment, getAgreementPublic, getEnrollmentCheckout, recordAgreementInitials,
  recordEnrollmentCard, replaceEnrollmentCard, retryEnrollmentDelivery, signAgreement,
} from '@/app/actions/agreements'
import { AgreementDocument, AgreementTermsBox, CertificateView, SignedBlock, formatUsd } from './agreement-document'
import { SignaturePad } from './signature-pad'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { stripePromise } from '@/lib/stripe-client'
import { apiUrl } from '@/lib/api'

function SaveCard({ onSaved, onError }: { onSaved: () => Promise<void>; onError: (s: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!stripe || !elements) return
    setBusy(true)
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements, redirect: 'if_required', confirmParams: { return_url: window.location.href },
      })
      if (error) onError(error.message ?? 'Could not save that card.')
      else if (setupIntent?.status === 'succeeded') await onSaved()
    } finally {
      setBusy(false)
    }
  }
  return <div className="space-y-4"><PaymentElement options={{ layout: 'tabs', terms: { card: 'never' } }} />
    <Button type="button" onClick={save} disabled={busy || !stripe || !elements}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save card (no charge)
    </Button>
  </div>
}

export function EnrollmentSigning({ token, initial }: { token: string; initial: any }) {
  return <ScopedEnrollmentSigning key={token} token={token} initial={initial} />
}

function ScopedEnrollmentSigning({ token, initial }: { token: string; initial: any }) {
  const [agreement, setAgreement] = useState(initial)
  const currentVersion = useRef(agreement.version)
  currentVersion.current = agreement.version
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const [checkout, setCheckout] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [signature, setSignature] = useState<any>(null)
  const [consent, setConsent] = useState(false)
  const [name, setName] = useState(initial.customer.full_name)
  const [title, setTitle] = useState('')
  const [initials, setInitials] = useState(initial.initials ?? {})
  const [chosenCard, setChosenCard] = useState('')
  const initialsWrites = useRef({ epoch: 0, pending: 0 })
  const oneTime = agreement.offer_type === 'one_time'

  useAgreementDisplayAcknowledgment(token, agreement.version, agreement.signed || agreement.expired)

  async function refresh() {
    const epoch = initialsWrites.current.epoch
    const pending = initialsWrites.current.pending
    const [next, state] = await Promise.all([getAgreementPublic(token), getEnrollmentCheckout(token)])
    if (!active.current || pending || initialsWrites.current.pending || epoch !== initialsWrites.current.epoch) return
    if (next) { setAgreement(next); setInitials(next.initials ?? {}) }
    if (state.ok) setCheckout(state.checkout)
    else setError(state.error ?? 'Enrollment is unavailable.')
  }
  useEffect(() => { void refresh() }, [token])
  useEffect(() => {
    if (checkout?.stage !== 'processing' && checkout?.stage !== 'done') return
    const timer = setInterval(() => void refresh(), 4000)
    return () => clearInterval(timer)
  }, [checkout?.stage, token])
  // An administrator can edit an unsigned version while the signer has the page open.
  useEffect(() => {
    if (agreement.signed || agreement.completed) return
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 4000)
    return () => clearInterval(timer)
  }, [agreement.signed, agreement.completed, token])
  useEffect(() => {
    if (checkout?.cards?.length && !checkout.cards.some((c: any) => c.id === chosenCard))
      setChosenCard(checkout.cards[0].id)
  }, [checkout?.cards, chosenCard])

  async function saveInitials(sectionId: string, value: string) {
    const version = agreement.version
    initialsWrites.current.epoch++
    initialsWrites.current.pending++
    let res
    try {
      res = await recordAgreementInitials(token, { version, sectionId, initials: value })
    } finally {
      initialsWrites.current.pending--
      initialsWrites.current.epoch++
    }
    if (!active.current || currentVersion.current !== version) return { ok: false, error: 'The agreement changed. Please review it again.' }
    if (res.ok) {
      setInitials(prev => ({ ...prev, [sectionId]: res.initials[sectionId] }))
      setError('')
    }
    else {
      setError(res.error ?? 'Could not save initials.')
      if (res.stale) await refresh()
    }
    return res
  }
  async function saveSignature() {
    setBusy(true); setError('')
    try {
      const res = await signAgreement(token, {
        version: agreement.version, consent, signerName: name.trim(), signerTitle: title.trim(),
        signatureType: signature?.type, signatureData: signature?.data, initials,
      })
      if (!res.ok) { setError(res.error ?? 'Signature not saved.'); await refresh(); return }
      await refresh()
    } finally { setBusy(false) }
  }
  async function cardSaved() {
    const res = await recordEnrollmentCard(token)
    if (!res.ok) setError(res.error ?? 'Could not save card.')
    else { setError(''); await refresh() }
  }
  async function finish() {
    setBusy(true); setError('')
    try {
      const res = await confirmEnrollment(token, chosenCard)
      if (res.requiresAction && res.clientSecret) {
        const stripe = await stripePromise
        const auth = await stripe?.handleCardAction(res.clientSecret)
        if (auth?.error) throw new Error(auth.error.message ?? 'Authentication was not completed.')
        // Stripe status is reconciled server-side on reload; never infer payment success here.
        await refresh()
      } else if (!res.ok) setError(res.error ?? 'Payment was not completed. Try again.')
      else await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  const doc = agreement.document
  const required = doc.sections.filter((s: any) => s.requiresInitials).map((s: any) => s.id)
  const due = oneTime ? agreement.amounts.setup_fee_cents : agreement.amounts.setup_fee_cents
  if (agreement.completed || checkout?.stage === 'done') return <div className="space-y-5">
    <h2 className="text-xl font-semibold">Enrollment complete</h2>
    <p>Your signature and enrollment are recorded. Email delivery is separate from payment confirmation.</p>
    {!agreement.pdf_ready && <p role="status" className="rounded-lg border border-amber-400 p-3 text-sm">Private document storage is pending or failed. The downloadable PDF can be generated here, but a stored copy and email delivery still need a retry.</p>}
    {agreement.delivery_status?.length ? <ul className="text-sm">{agreement.delivery_status.map((d: any) =>
      <li key={d.recipient}>{d.recipient}: {String(d.status).replace('_', ' ')}{d.error && ` (${d.error})`}</li>)}</ul>
      : <p className="text-sm">Completion email has not been accepted for delivery yet.</p>}
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true)
      try {
        const result = await retryEnrollmentDelivery(token)
        if (!result.ok) setError(result.error ?? 'Could not retry document delivery.')
        await refresh()
      } finally { setBusy(false) }
    }}>Retry document storage and email delivery</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <a href={apiUrl(`/agreements/${token}/pdf`)} className="inline-flex items-center gap-2 underline"><Download className="size-4" /> Download signed agreement and certificate</a>
    <AgreementDocument sections={doc.sections} initials={initials} readOnly />
    {agreement.signature ? <SignedBlock signature={agreement.signature} businessName={agreement.customer.business_name} /> : null}
    {agreement.certificate ? <CertificateView certificate={agreement.certificate} /> : null}
  </div>
  return <div className="space-y-6">
    {!oneTime && <AgreementTermsBox amounts={agreement.amounts} fields={doc.fields} />}
    {oneTime && <div className="rounded-lg border bg-card p-4"><strong>One-time purchase price: {formatUsd(due)}</strong><p>No recurring subscription.</p></div>}
    <article data-agreement-document className="rounded-lg border bg-card p-6">
      <AgreementDocument scope={`${token}:${agreement.version}`} sections={doc.sections} initials={initials} onInitial={agreement.signed ? undefined : saveInitials} readOnly={agreement.signed} />
    </article>
    {!agreement.signed && <section className="space-y-4 rounded-lg border bg-card p-6" data-testid="signature-section">
      <h2 className="text-lg font-semibold">Sign the agreement</h2>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} />
        I agree to sign and receive this agreement electronically.</label>
      <SignaturePad defaultName={name} value={signature} onChange={setSignature} disabled={busy} />
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Printed name" aria-label="Printed name" />
      <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
      <Button type="button" onClick={saveSignature} disabled={busy || !consent || !signature || !title.trim() || required.some((id: string) => !initials[id])}>
        Save signature — no payment yet
      </Button>
    </section>}
    {agreement.signed && <section className="space-y-4 rounded-lg border bg-card p-6" data-testid="cards-section">
      <h2 className="text-lg font-semibold">Save {oneTime ? 'a card' : 'two different cards'}</h2>
      <p className="text-sm text-muted-foreground">Saving a card does not collect the initial payment. Card details go directly to Stripe.</p>
      {checkout?.cards?.map((c: any, i: number) => <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
        <p>{i + 1}. {c.brand} •••• {c.last4} saved</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
          setBusy(true)
          try {
            const result = await replaceEnrollmentCard(token, c.id)
            if (!result.ok) setError(result.error ?? 'Could not replace card.')
            else await refresh()
          } finally { setBusy(false) }
        }}>Replace card</Button>
      </div>)}
      {(checkout?.stage === 'primary' || checkout?.stage === 'secondary') && checkout.clientSecret &&
        <Elements key={checkout.clientSecret} stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}>
          <SaveCard onSaved={cardSaved} onError={setError} />
        </Elements>}
    </section>}
    {checkout?.stage === 'ready' && <section className="space-y-4 rounded-lg border-2 border-primary bg-card p-6" data-testid="final-confirmation">
      <h2 className="text-lg font-semibold">Confirm enrollment and {due ? 'payment' : 'card authorization'}</h2>
      <p><strong>{formatUsd(due)} due now</strong>{!due && ' — setup payment waived; no charge today'}</p>
      {!oneTime && <p className="text-sm">Then {formatUsd(agreement.amounts.monthly_cents)} on the same day of each month, starting one calendar month after enrollment, for 12 consecutive months. The other saved card is backup for future billing under the agreement; it is not automatically tried for this initial payment.</p>}
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Choose the card {due ? 'to charge now' : 'for future payments'}</legend>
        {checkout.cards.map((c: any) => <label key={c.id} className="flex items-center gap-2 text-sm">
          <input type="radio" name="charge-card" checked={chosenCard === c.id} onChange={() => setChosenCard(c.id)} />
          {c.brand} •••• {c.last4}</label>)}</fieldset>
      <Button onClick={finish} disabled={busy || !chosenCard}>{busy ? 'Confirming…' : `Confirm enrollment${due ? ` and pay ${formatUsd(due)}` : ' — $0 today'}`}</Button>
    </section>}
    {checkout?.stage === 'processing' && <p role="status">Payment is processing. Do not submit another payment; this page will update automatically.</p>}
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  </div>
}
