// @ts-nocheck
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Eye, Loader2, RotateCcw, Send } from 'lucide-react'

import {
  getAgreementSendForm,
  previewAgreement,
  previewEnrollmentEmail,
  sendAgreement,
  updateAgreement,
  type AgreementTermsForm,
} from '@/app/actions/agreements'
import { AgreementDocument, AgreementTermsBox, formatUsd } from '@/components/agreements/agreement-document'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { notifyDone, notifyError } from '@/lib/notify'

/**
 * Send (new) or edit (existing, unsigned) a service agreement. The same form
 * serves both: term, monthly, setup fee, notice period and the agreement
 * text, with a live merged preview.
 */
export function AgreementFormDialog({
  open,
  onOpenChange,
  linkId,
  agreementId,
  mode,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  linkId: string
  agreementId?: string | null
  mode: 'send' | 'edit'
  onSaved?: (detail: any) => void
}) {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<AgreementTermsForm & { body: string; noticeDays: number } | null>(null)
  const [defaults, setDefaults] = useState<any>(null)
  const [mergeFields, setMergeFields] = useState<string[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [tab, setTab] = useState<'terms' | 'text' | 'preview'>('terms')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ url: string; qr: string; emailed: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [signerEmail, setSignerEmail] = useState('')
  const [copyEmails, setCopyEmails] = useState('')
  const [emailPreview, setEmailPreview] = useState<any>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setSent(null)
    setConfirming(false)
    setTab('terms')
    getAgreementSendForm(linkId)
      .then((res) => {
        if (!res.ok) {
          setError(res.error ?? 'Could not load the agreement form.')
          return
        }
        setForm(res.form)
        setSignerEmail(res.existing?.delivery_email ?? res.customerEmail ?? '')
        setCopyEmails((res.existing?.copy_emails ?? []).join(', '))
        setDefaults({ ...res.defaults, customerName: res.customerName })
        setMergeFields(res.mergeFields ?? [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the agreement form.'))
      .finally(() => setLoading(false))
  }, [open, linkId])

  // Debounced preview whenever the form changes
  useEffect(() => {
    if (!form || !open) return
    const t = setTimeout(() => {
      previewAgreement(linkId, form)
        .then((res) => {
          if (res.ok) {
            setPreview(res.document)
            setPreviewError(null)
          } else setPreviewError(res.error ?? 'Preview failed')
        })
        .catch(() => setPreviewError('Preview failed'))
    }, 350)
    return () => clearTimeout(t)
  }, [form, linkId, open])

  const set = (k: string, v: unknown) => setForm((f) => (f ? { ...f, [k]: v } : f))

  async function handleSave() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const res = mode === 'edit' && agreementId ? await updateAgreement(agreementId, form)
        : await sendAgreement(linkId, form, { signerEmail, copyEmails: copyEmails.split(/[,\n;]/).map(s => s.trim()).filter(Boolean) })
      if (!res.ok) {
        setError(res.error ?? 'Could not save the agreement.')
        return
      }
      onSaved?.(res.detail)
      if (mode === 'send') {
        const url = res.detail.agreement.public_url
        const qr = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#1d3d47', light: '#ffffff' } })
        setSent({ url, qr, emailed: res.deliveryStatus === 'provider_accepted' })
        notifyDone(res.emailed === false ? 'Agreement created (email failed — copy the link)' : 'Email accepted by provider (delivery not yet confirmed)', res.detail.agreement.delivery_email)
      } else {
        notifyDone('Agreement updated', 'The customer page refreshes within a few seconds')
        onOpenChange(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the agreement.')
    } finally {
      setSaving(false)
    }
  }

  const amounts = form
    ? {
        term_months: Number(form.termMonths) || 0,
        monthly_cents: Math.round(Number(form.monthlyDollars) * 100) || 0,
        setup_fee_cents: Math.round(Number(form.setupFeeDollars) * 100) || 0,
        notice_days: Number(form.noticeDays) || 0,
      }
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden p-0" data-testid="agreement-form-dialog">
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle>{sent ? 'Enrollment email requested' : mode === 'edit' ? 'Edit agreement' : 'Send Enrollment Email'}</DialogTitle>
          <DialogDescription>
            {sent
              ? 'The customer can sign on any device. Show them the QR code if they are on the phone with you.'
              : mode === 'edit'
                ? 'Changes create a new version. If the customer has the page open it updates live and changed sections need to be initialed again.'
                : 'Review the terms, adjust anything for this customer, then send the signing link by email.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
            </div>
          ) : sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <img src={sent.qr} alt="QR code for the signing link" width={256} height={256} className="rounded-lg border border-border bg-white p-2" data-testid="agreement-qr" />
              <p className="text-xs text-muted-foreground">Scan with a phone camera to open the signing page.</p>
              <div className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <code className="flex-1 truncate text-left text-xs">{sent.url}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(sent.url).then(() => notifyDone('Signing link copied'))}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
              {!sent.emailed ? (
                <p className="text-sm text-destructive">The email could not be sent. Share the link directly or re-send later.</p>
              ) : null}
            </div>
           ) : confirming && form ? (
             <div className="space-y-4">
               <p className="text-sm">The signer is still <strong>{defaults?.customerName}</strong>. This delivery address will not change their account or signing identity.</p>
               <Field label="Send signing link to" htmlFor="delivery-email">
                 <Input id="delivery-email" type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} required />
               </Field>
               <Field label="Copy-only addresses (comma-separated)" htmlFor="copy-emails">
                 <Input id="copy-emails" value={copyEmails} onChange={e => setCopyEmails(e.target.value)} placeholder="owner@example.com, manager@example.com" />
               </Field>
               <p className="text-xs text-muted-foreground">Copies are not additional signers. Provider acceptance does not guarantee delivery.</p>
               <h3 className="text-sm font-semibold">Actual enrollment email preview</h3>
               {emailPreview ? <div className="space-y-2"><strong>{emailPreview.subject}</strong>
                 <p className="text-xs text-muted-foreground">The personal signing URL is generated on send; before then the preview shows a placeholder.</p>
                 <iframe title="Enrollment email preview" sandbox="" srcDoc={emailPreview.html} className="h-64 w-full rounded border" />
                 {copyEmails.trim() && <><strong>{emailPreview.copySubject}</strong>
                   <p className="text-xs text-muted-foreground">Copy recipients receive this informational version, without a signing link.</p>
                   <iframe title="Copy-only email preview" sandbox="" srcDoc={emailPreview.copyHtml} className="h-36 w-full rounded border" />
                 </>}
               </div>
                 : <p className="text-sm text-muted-foreground">Loading email template…</p>}
             </div>
           ) : form ? (
            <div className="flex flex-col gap-4">
              <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist">
                {(['terms', 'text', 'preview'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium capitalize ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                    data-testid={`agreement-tab-${t}`}
                  >
                    {t === 'text' ? 'Agreement text' : t}
                  </button>
                ))}
              </div>

              {tab === 'terms' ? (
                <div className="flex flex-col gap-4">
                   <div className="grid gap-4 sm:grid-cols-2">
                    {Number(form.termMonths) === 0 ? (
                      <Field label="One-time purchase price ($)" htmlFor="ag-setup">
                        <Input id="ag-setup" type="number" min={0.5} step={0.01} value={form.setupFeeDollars} onChange={e => set('setupFeeDollars', e.target.value)} />
                        <p className="text-xs text-muted-foreground">Automatically filled from the negotiated amount in New Customer.</p>
                      </Field>
                    ) : (<>
                    <Field label="Term (months)" htmlFor="ag-term">
                      <Input id="ag-term" type="number" min={1} max={60} step={1} value={form.termMonths} onChange={(e) => set('termMonths', e.target.value)} data-testid="ag-term" />
                    </Field>
                    <Field label="Advance notice (days; standard template: 0)" htmlFor="ag-notice">
                      <Input id="ag-notice" type="number" min={0} max={365} step={1} value={form.noticeDays} onChange={(e) => set('noticeDays', e.target.value)} />
                      <p className="text-xs text-muted-foreground">The standard template accepts portal cancellation without advance notice. Positive values are for legacy or custom terms and are not enforced by the portal.</p>
                    </Field>
                    <Field label="Monthly amount ($)" htmlFor="ag-monthly">
                      <Input id="ag-monthly" type="number" min={0.5} step={0.01} value={form.monthlyDollars} onChange={(e) => set('monthlyDollars', e.target.value)} data-testid="ag-monthly" />
                    </Field>
                    <Field label="Setup fee ($) — 0 to waive" htmlFor="ag-setup">
                      <Input id="ag-setup" type="number" min={0} step={0.01} value={form.setupFeeDollars} onChange={(e) => set('setupFeeDollars', e.target.value)} data-testid="ag-setup" />
                    </Field>
                    </>)}
                  </div>
                   {defaults && Number(form.termMonths) !== 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                      <span>
                        Defaults: {defaults.termMonths} months · {formatUsd(defaults.monthlyDollars * 100)}/mo · {formatUsd(defaults.setupFeeDollars * 100)} setup
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm((f) => (f ? { ...f, termMonths: defaults.termMonths, monthlyDollars: defaults.monthlyDollars, setupFeeDollars: defaults.setupFeeDollars, noticeDays: defaults.noticeDays } : f))}
                      >
                        <RotateCcw className="size-3.5" /> Reset amounts
                      </Button>
                    </div>
                  ) : null}
                   {amounts && preview && Number(form.termMonths) !== 0 ? <AgreementTermsBox amounts={amounts} fields={preview.fields} /> : null}
                </div>
              ) : null}

              {tab === 'text' ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={form.body}
                    onChange={(e) => set('body', e.target.value)}
                    className="min-h-[420px] font-mono text-xs leading-relaxed"
                    spellCheck={false}
                    data-testid="ag-body"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sections start with <code>## Title</code>; add <code>[initials]</code> after a title to require initials. Merge fields:{' '}
                    {mergeFields.map((f) => (
                      <code key={f} className="mr-1">{`{{${f}}}`}</code>
                    ))}
                  </p>
                </div>
              ) : null}

              {tab === 'preview' ? (
                previewError ? (
                  <p className="text-sm text-destructive">{previewError}</p>
                ) : preview ? (
                  <div className="rounded-lg border border-border bg-card p-5" data-testid="agreement-preview">
                    <h3 className="mb-4 text-lg font-semibold">{preview.title}</h3>
                    <AgreementDocument sections={preview.sections} initials={{}} readOnly />
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Rendering preview…
                  </div>
                )
              ) : null}
            </div>
          ) : null}
          {error ? <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
           {sent ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
           ) : confirming ? (
             <>
               <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>Back</Button>
               <Button onClick={handleSave} disabled={saving || !emailPreview || !signerEmail} data-testid="agreement-send-confirm">
                 {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Enrollment Email
               </Button>
             </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              {tab !== 'preview' ? (
                <Button variant="outline" onClick={() => setTab('preview')} disabled={!form}>
                  <Eye className="size-4" /> Preview
                </Button>
              ) : null}
               <Button onClick={() => {
                 if (mode === 'edit') { void handleSave(); return }
                 setEmailPreview(null)
                 setConfirming(true)
                 void previewEnrollmentEmail(linkId, form).then(res => res.ok ? setEmailPreview(res) : setError(res.error ?? 'Email preview failed'))
               }} disabled={saving || !form || Boolean(previewError)} data-testid="agreement-save">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                 {mode === 'edit' ? 'Save new version' : 'Review delivery'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
