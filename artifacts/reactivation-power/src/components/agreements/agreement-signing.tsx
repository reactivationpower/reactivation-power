// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { AlertCircle, Check, CreditCard, Download, FileText, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'

import {
  getAgreementCheckout,
  getAgreementPublic,
  getAgreementVersion,
  recordAgreementInitials,
  recordAgreementPaymentFailure,
  recordAgreementPrimaryCard,
  recordAgreementSecondaryCard,
  signAgreement,
} from '@/app/actions/agreements'
import {
  AgreementDocument,
  AgreementStatusPill,
  AgreementTermsBox,
  CertificateView,
  SignedBlock,
  formatUsd,
  formatWhen,
} from '@/components/agreements/agreement-document'
import { SignaturePad, type SignatureValue } from '@/components/agreements/signature-pad'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiUrl } from '@/lib/api'
import { stripePromise } from '@/lib/stripe-client'
import { EnrollmentSigning } from './enrollment-signing'

const APPEARANCE = {
  theme: 'stripe',
  variables: { colorPrimary: '#1d3d47', borderRadius: '8px', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
} as const

const POLL_MS = 4000

type Handles = { stripe: any; elements: any }

/** Registers the Stripe handles of the enclosing <Elements> with the parent. */
function CardSlot({ onHandles, onReady }: { onHandles: (h: Handles | null) => void; onReady: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  useEffect(() => {
    onHandles(stripe && elements ? { stripe, elements } : null)
    return () => onHandles(null)
  }, [stripe, elements, onHandles])
  return <PaymentElement options={{ layout: 'tabs', terms: { card: 'never' } }} onReady={onReady} />
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)
}

export function AgreementSigning({ token, initial }: { token: string; initial: any }) {
  return initial.enrollment_flow
    ? <EnrollmentSigning token={token} initial={initial} />
    : <LegacyAgreementSigning token={token} initial={initial} />
}

function LegacyAgreementSigning({ token, initial }: { token: string; initial: any }) {
  const [agreement, setAgreement] = useState<any>(initial)
  const [initials, setInitials] = useState<Record<string, string>>(initial.initials ?? {})
  const [changedSections, setChangedSections] = useState<Set<string>>(new Set())
  const [updateNotice, setUpdateNotice] = useState<{ changes: string[] } | null>(null)
  const [checkout, setCheckout] = useState<any>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const [consent, setConsent] = useState(false)
  const [signerName, setSignerName] = useState(initial.customer.full_name ?? '')
  const [signerTitle, setSignerTitle] = useState('')
  const [signature, setSignature] = useState<SignatureValue>(null)

  // Which client secret each Stripe element reported ready for. Keyed by
  // secret so a remount (new intent) waits again, while an amount change on
  // the same intent keeps the already-mounted element usable.
  const [primaryReady, setPrimaryReady] = useState<string | null>(null)
  const [secondaryReady, setSecondaryReady] = useState<string | null>(null)
  const primaryHandles = useRef<Handles | null>(null)
  const secondaryHandles = useRef<Handles | null>(null)
  const setPrimaryHandles = useCallback((h: Handles | null) => {
    primaryHandles.current = h
  }, [])
  const setSecondaryHandles = useCallback((h: Handles | null) => {
    secondaryHandles.current = h
  }, [])

  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const doc = agreement.document
  const signed = agreement.signed
  const completed = agreement.completed
  const expired = agreement.expired && !signed

  const reloadAgreement = useCallback(async () => {
    const next = await getAgreementPublic(token)
    if (next) {
      setAgreement(next)
      setInitials(next.initials ?? {})
    }
    return next
  }, [token])

  const loadCheckout = useCallback(async () => {
    try {
      const res = await getAgreementCheckout(token)
      if (!res.ok) {
        setCheckoutError(res.error ?? 'Could not prepare payment.')
        return null
      }
      setCheckoutError(null)
      if (res.checkout.error) setNotice(res.checkout.error)
      setCheckout(res.checkout)
      return res.checkout
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not prepare payment.')
      return null
    }
  }, [token])

  useEffect(() => {
    if (!completed && !expired) void loadCheckout()
  }, [completed, expired, loadCheckout])

  // Live updates: the admin may edit the agreement while this page is open
  useEffect(() => {
    if (completed) return
    let stopped = false
    const tick = async () => {
      if (submitting || document.hidden) return
      try {
        const v = await getAgreementVersion(token)
        if (!v || stopped) return
        if (v.version !== agreement.version) {
          const prev = new Map(doc.sections.map((s: any) => [s.id, s.hash]))
          const prevAmounts = agreement.amounts
          const next = await getAgreementPublic(token)
          if (!next || stopped) return
          const changed = new Set<string>()
          const changes: string[] = []
          for (const s of next.document.sections) if (prev.get(s.id) !== s.hash) changed.add(s.id)
          if (next.document.sections.length !== doc.sections.length || [...changed].length) {
            changes.push(`${changed.size || 'Some'} section${changed.size === 1 ? '' : 's'} of the agreement text changed`)
          }
          if (prevAmounts.term_months !== next.amounts.term_months) changes.push(`Term: ${prevAmounts.term_months} → ${next.amounts.term_months} months`)
          if (prevAmounts.monthly_cents !== next.amounts.monthly_cents) changes.push(`Monthly amount: ${formatUsd(prevAmounts.monthly_cents)} → ${formatUsd(next.amounts.monthly_cents)}`)
          if (prevAmounts.setup_fee_cents !== next.amounts.setup_fee_cents) changes.push(`Setup fee: ${formatUsd(prevAmounts.setup_fee_cents)} → ${formatUsd(next.amounts.setup_fee_cents)}`)
          setAgreement(next)
          setInitials(next.initials ?? {})
          setChangedSections(changed)
          setUpdateNotice({ changes: changes.length ? changes : ['The agreement was updated'] })
          void loadCheckout()
          // Same PaymentIntent, new amount: refresh the mounted element
          void primaryHandles.current?.elements?.fetchUpdates?.()
        } else if (v.status !== agreement.status && (v.status === 'completed' || v.status === 'signed' || v.status === 'payment_pending')) {
          await reloadAgreement()
        }
      } catch {
        /* transient — try again next tick */
      }
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [token, agreement, doc, completed, submitting, loadCheckout, reloadAgreement])

  const onInitial = useCallback(
    async (sectionId: string, value: string) => {
      const res = await recordAgreementInitials(token, { version: agreement.version, sectionId, initials: value })
      if (res.ok) {
        setInitials(res.initials ?? {})
        setChangedSections((prev) => {
          if (!prev.has(sectionId)) return prev
          const next = new Set(prev)
          next.delete(sectionId)
          return next
        })
      } else if (res.stale) {
        await reloadAgreement()
      }
      return res
    },
    [token, agreement.version, reloadAgreement],
  )

  const requiredIds = useMemo(() => doc.sections.filter((s: any) => s.requiresInitials).map((s: any) => s.id), [doc])
  const missingInitials = requiredIds.filter((id: string) => !initials[id])
  const stage = checkout?.stage ?? 'primary'
  const needPrimary = stage === 'primary'
  const cardsReady =
    Boolean(checkout) &&
    (!needPrimary || (checkout?.primary && primaryReady === checkout.primary.clientSecret)) &&
    Boolean(checkout?.secondary && secondaryReady === checkout.secondary.clientSecret)
  const signatureComplete = signed || (consent && signature && signerName.trim().length >= 2 && signerTitle.trim().length > 0 && missingInitials.length === 0)
  const canSubmit = !submitting && !expired && !updateNotice && signatureComplete && cardsReady && !checkoutError

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      // 1. Signature
      if (!signed) {
        setStep('Recording your signature…')
        const res = await signAgreement(token, {
          version: agreement.version,
          consent,
          signerName: signerName.trim(),
          signerTitle: signerTitle.trim(),
          signatureType: signature.type,
          signatureData: signature.data,
          initials,
        })
        if (!res.ok) {
          setError(res.error ?? 'Could not record your signature.')
          if (res.stale) await reloadAgreement()
          return
        }
        await reloadAgreement()
      }

      // 2. Primary card (setup fee)
      let current = checkout
      if (current.stage === 'primary') {
        const h = primaryHandles.current
        if (!h) throw new Error('The card form is not ready yet.')
        setStep(current.setupFeeCents > 0 ? `Charging ${formatUsd(current.setupFeeCents)} setup fee…` : 'Saving your primary card…')
        const returnUrl = window.location.href
        const confirm =
          current.primary.intentType === 'payment'
            ? await h.stripe.confirmPayment({ elements: h.elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
            : await h.stripe.confirmSetup({ elements: h.elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
        if (confirm.error) {
          const msg = confirm.error.message ?? 'Your card could not be processed.'
          await recordAgreementPaymentFailure(token, msg)
          await reloadAgreement()
          setError(`${msg} Your signature has been saved — fix the card details and try again.`)
          return
        }
        const rec = await recordAgreementPrimaryCard(token)
        if (!rec.ok) {
          await reloadAgreement()
          setError(rec.error ?? 'The payment could not be recorded. Please try again.')
          return
        }
        current = (await loadCheckout()) ?? current
        setPrimaryReady(null)
      }

      // 3. Backup card
      if (current.stage === 'secondary') {
        const h = secondaryHandles.current
        if (!h) throw new Error('The backup card form is not ready yet.')
        setStep('Saving your backup card…')
        const confirm = await h.stripe.confirmSetup({
          elements: h.elements,
          redirect: 'if_required',
          confirmParams: { return_url: window.location.href },
        })
        if (confirm.error) {
          const msg = confirm.error.message ?? 'Your backup card could not be saved.'
          await recordAgreementPaymentFailure(token, msg)
          await reloadAgreement()
          setError(`${msg} Your setup fee is paid — add a valid backup card to finish.`)
          return
        }
        const rec = await recordAgreementSecondaryCard(token)
        if (!rec.ok) {
          if (rec.duplicate) {
            setNotice(rec.error)
            setSecondaryReady(null)
            await loadCheckout()
            return
          }
          await reloadAgreement()
          setError(rec.error ?? 'The backup card could not be saved. Please try again.')
          return
        }
      }

      // 4. Done
      setStep('Finishing up…')
      await reloadAgreement()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
      setStep(null)
    }
  }

  const pdfHref = apiUrl(`/agreements/${token}/pdf`)

  // ── Completed / signed read-only view ─────────────────────────────
  if (completed) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-center" data-testid="agreement-status"><AgreementStatusPill status={agreement.status} /></div>
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-emerald-950">Agreement completed</p>
              <p className="text-sm text-emerald-900/80">
                Signed {formatWhen(agreement.signature?.signed_at)} · A copy with the certificate of completion was emailed to {agreement.customer.email}.
              </p>
            </div>
          </div>
          <a href={pdfHref} data-testid="download-pdf" className={buttonVariants({ size: 'lg' })}>
            <Download className="size-4" /> Download PDF
          </a>
        </div>
        <AgreementTermsBox amounts={agreement.amounts} fields={doc.fields} />
        <article className="rounded-lg border border-border bg-card p-5 sm:p-8">
          <AgreementDocument sections={doc.sections} initials={initials} readOnly />
        </article>
        {agreement.signature ? <SignedBlock signature={agreement.signature} businessName={agreement.customer.business_name} /> : null}
        {agreement.certificate ? <CertificateView certificate={agreement.certificate} /> : null}
      </div>
    )
  }

  if (expired) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-center" data-testid="agreement-status"><AgreementStatusPill status={agreement.status} /></div>
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
        <p className="font-semibold">This signing link has expired.</p>
        <p className="mt-1">Reply to the email you received or contact {agreement.company.email} and we will send a fresh link.</p>
      </div>
      </div>
    )
  }

  // ── Signing view (or payment retry when already signed) ───────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex justify-center" data-testid="agreement-status"><AgreementStatusPill status={agreement.status} /></div>
      <UpdateModal notice={updateNotice} onClose={() => setUpdateNotice(null)} />

      {signed ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="payment-pending-banner">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Signed {formatWhen(agreement.signature?.signed_at)} — payment still needed</p>
            <p>Your signature is saved. Add your card{stage === 'secondary' ? ' (backup card)' : 's'} below to start the subscription. You will not need to sign again.</p>
          </div>
        </div>
      ) : null}

      <AgreementTermsBox amounts={agreement.amounts} fields={doc.fields} />

      <article className="rounded-lg border border-border bg-card p-5 sm:p-8">
        <AgreementDocument
          sections={doc.sections}
          initials={initials}
          onInitial={onInitial}
          readOnly={signed}
          highlight={changedSections}
          suggestedInitials={initialsFromName(signerName)}
        />
      </article>

      {!signed ? (
        <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:p-8" data-testid="signature-section">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sign the agreement</h2>
            <p className="text-sm text-muted-foreground">
              {missingInitials.length
                ? `${missingInitials.length} section${missingInitials.length === 1 ? '' : 's'} still need your initials above.`
                : 'All sections are initialed.'}
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" data-testid="consent" />
            <span>
              I agree to sign this agreement electronically and to receive records electronically. My electronic signature and initials have the same
              effect as a handwritten signature.
            </span>
          </label>
          <SignaturePad defaultName={signerName} value={signature} onChange={setSignature} disabled={submitting} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signer-name">Printed name</Label>
              <Input id="signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={120} required data-testid="signer-name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signer-title">Title</Label>
              <Input id="signer-title" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="Owner" maxLength={80} required data-testid="signer-title" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Date: <span className="font-medium text-foreground">{new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</span>
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:p-8" data-testid="cards-section">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CreditCard className="size-5" /> Payment cards
          </h2>
          <p className="text-sm text-muted-foreground">
            {agreement.amounts.setup_fee_cents > 0
              ? `${formatUsd(agreement.amounts.setup_fee_cents)} setup fee is charged to the primary card when you submit, then ${formatUsd(agreement.amounts.monthly_cents)}/month starting ${doc.fields.start_date}.`
              : `Nothing is charged today. ${formatUsd(agreement.amounts.monthly_cents)}/month starts ${doc.fields.start_date}.`}{' '}
            A backup card is required and is only used if the primary card fails.
          </p>
        </div>

        {checkoutError ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{checkoutError}</p>
        ) : !checkout ? (
          <div className="flex items-center justify-center rounded-lg border border-border p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Preparing secure card entry…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">1. Primary card</p>
              {checkout.stage === 'primary' && checkout.primary ? (
                <Elements key={checkout.primary.clientSecret} stripe={stripePromise} options={{ clientSecret: checkout.primary.clientSecret, appearance: APPEARANCE }}>
                  <CardSlot onHandles={setPrimaryHandles} onReady={() => setPrimaryReady(checkout.primary!.clientSecret)} />
                </Elements>
              ) : (
                <p className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <Check className="size-4" /> {checkout.primaryCard ? `${checkout.primaryCard.brand} •••• ${checkout.primaryCard.last4}` : 'Saved'}
                  {agreement.amounts.setup_fee_cents > 0 ? ' — setup fee paid' : ''}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">2. Backup card <span className="font-normal text-muted-foreground">(must be a different card)</span></p>
              {checkout.secondary ? (
                <Elements key={checkout.secondary.clientSecret} stripe={stripePromise} options={{ clientSecret: checkout.secondary.clientSecret, appearance: APPEARANCE }}>
                  <CardSlot onHandles={setSecondaryHandles} onReady={() => setSecondaryReady(checkout.secondary!.clientSecret)} />
                </Elements>
              ) : null}
            </div>
          </>
        )}

        {notice ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="submit-error">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={!canSubmit} className="h-12 w-full text-base" data-testid="submit-agreement">
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {step ?? 'Working…'}
            </>
          ) : signed ? (
            stage === 'secondary' ? 'Save backup card and start subscription' : `Pay ${formatUsd(agreement.amounts.setup_fee_cents)} and start subscription`
          ) : agreement.amounts.setup_fee_cents > 0 ? (
            `Sign and pay ${formatUsd(agreement.amounts.setup_fee_cents)}`
          ) : (
            'Sign and start subscription'
          )}
        </Button>
        {!canSubmit && !submitting ? (
          <p className="text-center text-xs text-muted-foreground" data-testid="submit-hint">
            {updateNotice
              ? 'Review the updated agreement to continue.'
              : !signed && missingInitials.length
                ? 'Initial every marked section to continue.'
                : !signed && !consent
                  ? 'Tick the electronic-signature consent to continue.'
                  : !signed && !signature
                    ? 'Add your signature to continue.'
                    : !signed && (!signerName.trim() || !signerTitle.trim())
                      ? 'Enter your printed name and title.'
                      : !cardsReady
                        ? 'Card forms are loading…'
                        : ''}
          </p>
        ) : null}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" /> Cards are stored by Stripe and never touch our servers.
        </p>
      </section>
    </form>
  )
}

function UpdateModal({ notice, onClose }: { notice: { changes: string[] } | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(notice)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="agreement-updated-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5 text-primary" /> This agreement was updated
          </DialogTitle>
          <DialogDescription>
            The agreement changed while you had it open. Please review the current version; sections that changed are highlighted and need to be
            initialed again.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {notice?.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose} data-testid="agreement-updated-ok">
            <FileText className="size-4" /> Review the updated agreement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
