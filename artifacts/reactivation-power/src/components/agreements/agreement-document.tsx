// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { InitialsBox } from './initials-box'
import { SignatureImage } from '@/components/agreements/signature-pad'

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  signed: 'Signed',
  payment_pending: 'Payment pending',
  completed: 'Completed',
  expired: 'Expired',
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-sky-100 text-sky-900',
  viewed: 'bg-indigo-100 text-indigo-900',
  signed: 'bg-amber-100 text-amber-900',
  payment_pending: 'bg-orange-100 text-orange-900',
  completed: 'bg-emerald-100 text-emerald-900',
  expired: 'bg-rose-100 text-rose-900',
}

export function AgreementStatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status] ?? STATUS_CLASS.draft}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

/** Terms summary shown above the agreement text. */
export function AgreementTermsBox({
  amounts,
  fields,
}: {
  amounts: { term_months: number; monthly_cents: number; setup_fee_cents: number; notice_days: number }
  fields: Record<string, string>
}) {
  const items = [
    ['Term', `${amounts.term_months} months`],
    ['Monthly amount', formatUsd(amounts.monthly_cents)],
    ['Setup fee', amounts.setup_fee_cents > 0 ? `${formatUsd(amounts.setup_fee_cents)} today` : 'Waived'],
    ['Start date', fields.start_date],
    ['End date', fields.end_date],
    ['Cancellation notice', amounts.notice_days > 0
      ? `${amounts.notice_days} days before end of term`
      : 'No advance notice; ends at term or billing-period end'],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3" data-testid="agreement-terms">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="text-sm font-semibold text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

interface Section {
  id: string
  title: string
  paragraphs: string[]
  requiresInitials: boolean
  hash: string
  initials?: string | null
}

/**
 * The agreement body. In signing mode each required section has an initials
 * box. Reuse always requires explicit activation and a confirmed source save.
 */
export function AgreementDocument({
  sections,
  initials,
  onInitial,
  readOnly,
  highlight,
  suggestedInitials,
  scope,
}: {
  sections: Section[]
  initials: Record<string, string>
  onInitial?: (sectionId: string, value: string) => Promise<{ ok: boolean; error?: string }>
  readOnly?: boolean
  /** Sections changed by the latest edit (shown with a marker until re-initialed). */
  highlight?: Set<string>
  suggestedInitials?: string
  /** Signer link + document version. Resets drafts and queued acknowledgments. */
  scope?: string
}) {
  const key = JSON.stringify([scope, readOnly, sections.map(s => [s.id, s.hash, s.requiresInitials])])
  return <ScopedAgreementDocument key={key} {...{ sections, initials, onInitial, readOnly, highlight, suggestedInitials }} />
}

function ScopedAgreementDocument({ sections, initials, onInitial, readOnly, highlight, suggestedInitials }) {
  const firstId = sections.find(s => s.requiresInitials)?.id
  const [firstDraft, setFirstDraft] = useState(initials[firstId] ?? '')
  const source = useRef(initials[firstId] ?? '')
  const [seenFirst, setSeenFirst] = useState(source.current)
  if (seenFirst !== (initials[firstId] ?? '')) {
    source.current = initials[firstId] ?? ''
    setSeenFirst(source.current)
    setFirstDraft(source.current)
  }
  const draftRef = useRef(firstDraft)
  draftRef.current = firstDraft
  const pending = useRef(new Map())
  const tail = useRef(Promise.resolve())
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  function save(sectionId, value) {
    if (pending.current.has(sectionId)) return pending.current.get(sectionId)
    // Serialize full-map server responses, including rapid clicks on different
    // sections. A queued acknowledgment cannot survive a scope/version change.
    const attempt = tail.current.then(async () => {
      if (!active.current || !onInitial) return { ok: false, error: 'Review the current agreement and try again.' }
      try {
        const result = await onInitial(sectionId, value)
        if (!active.current) return { ok: false, error: 'The agreement changed. Please review it again.' }
        if (result.ok && sectionId === firstId) source.current = value
        return result
      } catch {
        return { ok: false, error: 'Could not save initials. Please try again.' }
      }
    }).finally(() => pending.current.delete(sectionId))
    pending.current.set(sectionId, attempt)
    tail.current = attempt.then(() => undefined)
    return attempt
  }

  async function reuse(sectionId) {
    // Blur may have just started the first save. Wait for that exact attempt,
    // not a placeholder or stale persisted value, before acknowledging this one.
    const entered = draftRef.current.trim().toUpperCase()
    const firstAttempt = pending.current.get(firstId)
    if (firstAttempt || (entered && entered !== source.current)) {
      const result = await (firstAttempt ?? save(firstId, entered))
      if (!result.ok) return { ...result, error: `First section: ${result.error ?? 'Could not save initials. Please try again.'}` }
    }
    if (!active.current || !source.current) return { ok: false, error: 'Save your initials in the first section first.' }
    return save(sectionId, source.current)
  }

  return (
    <div className="flex flex-col gap-7">
      {sections.map((s, i) => (
        <section key={s.id} id={`section-${s.id}`} className={highlight?.has(s.id) ? 'rounded-lg ring-2 ring-amber-300 ring-offset-4' : ''}>
          <h2 className="text-base font-semibold text-foreground">
            {i + 1}. {s.title}
          </h2>
          <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90">
            {s.paragraphs.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
          {s.requiresInitials ? (
            readOnly ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <Check className="size-3.5" /> Initialed {initials[s.id] ?? s.initials ?? ''}
              </p>
            ) : (
              <InitialsBox
                sectionId={s.id}
                sectionTitle={s.title}
                value={initials[s.id] ?? ''}
                changed={highlight?.has(s.id)}
                suggested={suggestedInitials}
                onSave={save}
                onDraft={s.id === firstId ? setFirstDraft : undefined}
                reuseLabel={s.id !== firstId && !initials[s.id] && firstDraft.trim()
                  ? (firstDraft.trim().toUpperCase() === source.current ? `Use ${source.current} initials` : 'Use initials from first section')
                  : undefined}
                onReuse={reuse}
              />
            )
          ) : null}
        </section>
      ))}
    </div>
  )
}

/** Signature block + certificate for a signed agreement. */
export function SignedBlock({
  signature,
  businessName,
}: {
  signature: { type: 'typed' | 'drawn'; data: string; signer_name: string; signer_title: string | null; signed_at: string }
  businessName: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5" data-testid="signature-block">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed by</p>
      <div className="mt-3 border-b border-foreground/60 pb-2">
        <SignatureImage type={signature.type} data={signature.data} />
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{signature.signer_name}</p>
      <p className="text-xs text-muted-foreground">
        {signature.signer_title ? `${signature.signer_title}, ` : ''}
        {businessName} · {formatWhen(signature.signed_at)}
      </p>
    </div>
  )
}

export function CertificateView({ certificate }: { certificate: any }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5" data-testid="certificate">
      <h2 className="text-lg font-semibold text-foreground">Certificate of Completion</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row k="Agreement ID" v={certificate.agreementId} mono />
        <Row k="Version signed" v={certificate.signedVersion ?? '—'} />
        <Row k="Signer" v={`${certificate.signer.name ?? '—'}${certificate.signer.title ? `, ${certificate.signer.title}` : ''}`} />
        <Row k="Signer email" v={certificate.signer.email} />
        <Row k="Signed at" v={formatWhen(certificate.signer.signedAt)} />
        <Row k="Signature" v={certificate.signer.signatureType === 'drawn' ? 'Drawn (touch / mouse)' : 'Typed'} />
        <Row k="Signer IP" v={certificate.signer.ip ?? '—'} mono />
        <Row k="Sent by" v={`${certificate.sender.name ?? '—'} · ${formatWhen(certificate.sender.sentAt)}`} />
        <div className="sm:col-span-2">
          <Row k="Document fingerprint (SHA-256)" v={certificate.documentHash ?? '—'} mono />
        </div>
      </dl>
      <h3 className="mt-5 text-sm font-semibold text-foreground">Audit trail</h3>
      <ol className="mt-2 divide-y divide-border text-sm">
        {certificate.events.map((e: any, i: number) => (
          <li key={i} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:gap-4">
            <span className="w-44 shrink-0 text-xs text-muted-foreground">{formatWhen(e.at)}</span>
            <span className="flex-1">
              <span className="font-medium text-foreground">{e.label}</span>
              {e.detail ? <span className="text-muted-foreground"> — {e.detail}</span> : null}
              <span className="block text-xs text-muted-foreground">
                {e.actor}
                {e.ip ? ` · ${e.ip}` : ''}
                {e.userAgent ? ` · ${e.userAgent}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className={`text-foreground ${mono ? 'break-all font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  )
}
