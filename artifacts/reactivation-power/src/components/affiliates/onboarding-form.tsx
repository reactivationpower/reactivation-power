import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'wouter'
import {
  emptyAddress, isStaleError, needsFreshVerification,
  type Onboarding, type OnboardingContact, type UsAddress, type WireInput,
} from '@/app/actions/affiliate-onboarding'
import { Field, PrivacyNote, btn2Cls, btnCls, fmtDate, inputCls } from '@/components/affiliates/shared'

export interface OnboardingAdapter {
  get: () => Promise<Onboarding>
  save: (input: { version: number; contact: OnboardingContact; wire?: WireInput; w9Base64?: string }) => Promise<{ ok: true; version: number }>
  requestLink: (email: string) => Promise<unknown>
  backHref: string
  backLabel: string
  accessHref: string
  eyebrow: string
  payerNote: string
  verificationLabel?: string
}

const W9_URL = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf'
const MAX_PDF = 2 * 1024 * 1024
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')

const emptyContact = (): OnboardingContact => ({ contactName: '', phone: '', legalName: '', dba: '', address: emptyAddress() })
const emptyWire = (): WireInput => ({ bankName: '', bankAddress: emptyAddress(), accountHolder: '', accountType: 'checking', routingNumber: '', accountNumber: '', accountConfirmation: '', instructions: '' })

function abaValid(r: string) {
  if (!/^\d{9}$/.test(r)) return false
  const d = r.split('').map(Number)
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0
}

function readPdf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Could not read that file.'))
    fr.onload = () => {
      const s = String(fr.result ?? '')
      const b64 = s.slice(s.indexOf(',') + 1)
      if (!atob(b64.slice(0, 8)).startsWith('%PDF')) return reject(new Error('That file is not a PDF.'))
      resolve(b64)
    }
    fr.readAsDataURL(file)
  })
}

function Step({ n, title, desc, children }: { n: string; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {desc ? <div className="mt-1 text-sm text-muted-foreground">{desc}</div> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function AddressFields({ v, set, prefix }: { v: UsAddress; set: (a: UsAddress) => void; prefix: string }) {
  const u = (k: keyof UsAddress, val: string) => set({ ...v, [k]: val, country: 'US' })
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-6"><Field label="Street address"><input required autoComplete="off" className={inputCls} value={v.line1} onChange={(e) => u('line1', e.target.value)} data-testid={`input-${prefix}-line1`} /></Field></div>
      <div className="sm:col-span-6"><Field label="Suite / unit (optional)"><input className={inputCls} value={v.line2} onChange={(e) => u('line2', e.target.value)} data-testid={`input-${prefix}-line2`} /></Field></div>
      <div className="sm:col-span-3"><Field label="City"><input required className={inputCls} value={v.city} onChange={(e) => u('city', e.target.value)} data-testid={`input-${prefix}-city`} /></Field></div>
      <div className="sm:col-span-1"><Field label="State"><select required className={inputCls} value={v.state} onChange={(e) => u('state', e.target.value)} data-testid={`select-${prefix}-state`}><option value="">--</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
      <div className="sm:col-span-2"><Field label="ZIP"><input required inputMode="numeric" pattern="\d{5}(-\d{4})?" className={inputCls} value={v.zip} onChange={(e) => u('zip', e.target.value)} data-testid={`input-${prefix}-zip`} /></Field></div>
      <p className="sm:col-span-6 text-xs text-muted-foreground">Country: United States. Only U.S. addresses and U.S. bank accounts are accepted.</p>
    </div>
  )
}

function StatusBadge({ s }: { s: Onboarding['status'] }) {
  const map = { incomplete: ['Not submitted', 'bg-muted text-muted-foreground'], submitted: ['Received, awaiting review', 'bg-primary/10 text-primary'], reviewed: ['Reviewed by Patient Pipeline', 'bg-success/15 text-success'] } as const
  return <span data-testid="status-onboarding" className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${map[s][1]}`}>{map[s][0]}</span>
}

export function OnboardingFormPage({ adapter }: { adapter: OnboardingAdapter }) {
  const [data, setData] = useState<Onboarding | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadErr, setLoadErr] = useState('')
  const [contact, setContact] = useState<OnboardingContact>(emptyContact)
  const [replaceBank, setReplaceBank] = useState(false)
  const [wire, setWire] = useState<WireInput>(emptyWire)
  const [file, setFile] = useState<File | null>(null)
  const [fileErr, setFileErr] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stale, setStale] = useState(false)
  const [needVerify, setNeedVerify] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [done, setDone] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const load = useCallback(async () => {
    setLoadState('loading'); setLoadErr('')
    try {
      const d = await adapter.get()
      if (!mounted.current) return
      setData(d); setContact(d.contact ? { ...d.contact, dba: d.contact.dba ?? '', address: { ...d.contact.address, line2: d.contact.address.line2 ?? '' } } : emptyContact())
      setReplaceBank(false); setWire(emptyWire()); setFile(null); if (fileInput.current) fileInput.current.value = ''
      setStale(false); setErr(''); setLoadState('ready')
    } catch (e) { if (mounted.current) { setLoadErr((e as Error).message); setLoadState('error') } }
  }, [adapter])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const clear = () => {
      setWire(emptyWire()); setContact(emptyContact()); setFile(null); setData(null)
      if (fileInput.current) fileInput.current.value = ''
    }
    const resume = (e: PageTransitionEvent) => { if (e.persisted) void load() }
    window.addEventListener('pagehide', clear); window.addEventListener('pageshow', resume)
    return () => { window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', resume) }
  }, [load])

  const initial = !data?.bank || !data?.w9Received
  const wireOpen = initial || replaceBank

  async function onPick(f: File | null) {
    setFileErr(''); setFile(null)
    if (!f) return
    if (f.type && f.type !== 'application/pdf') { setFileErr('Upload a PDF file.'); return }
    if (f.size > MAX_PDF) { setFileErr('The PDF must be 2 MB or smaller.'); return }
    setFile(f)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!data) return
    setErr(''); setNeedVerify(false); setLinkSent(false)
    if (wireOpen) {
      if (!abaValid(wire.routingNumber)) return setErr('Enter a valid 9-digit ABA routing number for wires.')
      if (!/^\d{4,17}$/.test(wire.accountNumber)) return setErr('Account numbers are 4 to 17 digits.')
      if (wire.accountNumber !== wire.accountConfirmation) return setErr('The account number confirmation does not match.')
    }
    if (!data.w9Received && !file) return setErr('Attach your completed, signed W-9 PDF.')
    setBusy(true)
    try {
      const w9Base64 = file ? await readPdf(file) : undefined
      const r = await adapter.save({ version: data.version, contact, ...(wireOpen ? { wire } : {}), ...(w9Base64 ? { w9Base64 } : {}) })
      if (!mounted.current) return
      setWire(emptyWire()); setFile(null)
      setDone(true)
      await load()
      setData((d) => d ? { ...d, version: Math.max(d.version, r.version) } : d)
    } catch (x) {
      if (!mounted.current) return
      if (isStaleError(x)) setStale(true)
      else if (needsFreshVerification(x)) setNeedVerify(true)
      else setErr((x as Error).message)
    } finally { if (mounted.current) setBusy(false) }
  }

  async function sendLink() {
    if (!data?.loginEmail) return
    try { await adapter.requestLink(data.loginEmail); setLinkSent(true) } catch (x) { setErr((x as Error).message) }
  }

  const header = (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <img src="/images/patient-pipeline-logo.png" alt="Patient Pipeline" className="h-8 w-auto rounded bg-white" />
        <Link href={adapter.backHref} className={btn2Cls} data-testid="link-back-portal">{adapter.backLabel}</Link>
      </div>
    </header>
  )

  if (loadState === 'loading') return (
    <div className="min-h-[100dvh] bg-background">{header}
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}</div>
    </div>
  )
  if (loadState === 'error' || !data) return (
    <div className="mx-auto max-w-md space-y-4 p-10 text-center" data-testid="status-signed-out">
      <h1 className="text-2xl font-semibold">Sign in with your inbox</h1>
      <p className="text-sm text-muted-foreground">{loadErr || 'Your session is missing or expired.'} Request a fresh link and you will return to payment onboarding.</p>
      <div className="flex justify-center gap-2"><Link href={adapter.accessHref} className={btnCls} data-testid="link-request-access">Request access</Link><button className={btn2Cls} onClick={() => void load()} data-testid="button-retry">Retry</button></div>
    </div>
  )

  const cu = (k: keyof OnboardingContact, v: string) => setContact({ ...contact, [k]: v })
  const wu = (k: keyof WireInput, v: string) => setWire({ ...wire, [k]: v })

  return (
    <div className="min-h-[100dvh] bg-background">
      {header}
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{adapter.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Payment onboarding</h1>
          <p className="mt-3 text-muted-foreground">{adapter.payerNote}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge s={data.status} />
            {data.submittedAt && <span className="text-xs text-muted-foreground" data-testid="text-submitted-at">Received {fmtDate(data.submittedAt)}</span>}
            {data.reviewedAt && <span className="text-xs text-muted-foreground" data-testid="text-reviewed-at">Reviewed {fmtDate(data.reviewedAt)}</span>}
          </div>
          {data.status === 'reviewed' && <p className="mt-2 text-xs text-muted-foreground">Review means our team looked over your submission. It is not bank verification or IRS validation.</p>}
        </div>

        <aside className="rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-relaxed">
          <p className="font-medium">Before you start</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>U.S. payees and U.S. bank accounts only.</li>
            <li>Ask your bank for its <em>wire</em> routing number. It can differ from the ACH number printed on checks.</li>
            <li>Download the official W-9 from <a className="underline" href={W9_URL} target="_blank" rel="noopener noreferrer" data-testid="link-irs-w9">irs.gov (fw9.pdf)</a>, complete and sign it, then upload the PDF here. Your taxpayer ID belongs on the W-9 only; this form never asks for an SSN or EIN.</li>
            <li>Never email bank or tax details to anyone, including us. This page is the only place to submit them.</li>
          </ul>
        </aside>

        {done && <div role="status" data-testid="status-saved" className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">Received. Our team will review it before the next monthly wire run. You can update details here at any time.</div>}

        {stale && (
          <div role="alert" data-testid="status-stale" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">These details changed since you opened this page.</p>
            <p className="mt-1 text-muted-foreground">Nothing was saved. Reload the latest version, then re-enter your changes. Bank numbers and the PDF are not kept between attempts.</p>
            <button type="button" className={btn2Cls + ' mt-3'} onClick={() => void load()} data-testid="button-reload-latest">Reload latest</button>
          </div>
        )}

        {needVerify && (
          <div role="alert" data-testid="status-need-verify" className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Confirm your inbox again to change bank details.</p>
            <p className="mt-1 text-muted-foreground">For your protection, replacing bank details needs a recent inbox verification. We will email a fresh link{data.loginEmail ? <> to <span className="font-mono">{data.loginEmail}</span></> : null} that brings you back here.</p>
            {linkSent ? <p className="mt-3 font-medium" data-testid="status-link-sent">Link sent. Check your inbox.</p> : <button type="button" disabled={!data.loginEmail} className={btn2Cls + ' mt-3'} onClick={() => void sendLink()} data-testid="button-send-verification">{adapter.verificationLabel ?? 'Email me a verification link'}</button>}
          </div>
        )}

        <form className="space-y-6" onSubmit={submit} autoComplete="off">
          <Step n="01" title="Contact and payee" desc="The legal name must match the name on your bank account and W-9.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contact name"><input required className={inputCls} value={contact.contactName} onChange={(e) => cu('contactName', e.target.value)} data-testid="input-contact-name" /></Field>
              <Field label="Phone"><input required type="tel" inputMode="tel" className={inputCls} value={contact.phone} onChange={(e) => cu('phone', e.target.value)} data-testid="input-phone" /></Field>
              <Field label="Legal payee or business name"><input required className={inputCls} value={contact.legalName} onChange={(e) => cu('legalName', e.target.value)} data-testid="input-legal-name" /></Field>
              <Field label="DBA (optional)"><input className={inputCls} value={contact.dba} onChange={(e) => cu('dba', e.target.value)} data-testid="input-dba" /></Field>
            </div>
            <AddressFields prefix="mail" v={contact.address} set={(a) => setContact({ ...contact, address: a })} />
          </Step>

          <Step n="02" title="Wire details" desc="Formatting checks catch typos only. They do not verify account ownership or that the account accepts wires.">
            {!wireOpen && data.bank ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border p-4 text-sm" data-testid="card-bank-summary">
                  <p className="font-medium">{data.bank.bankName}</p>
                  <p className="text-muted-foreground">{data.bank.accountHolder} | {data.bank.accountType} | account ending <span className="font-mono">{data.bank.last4}</span></p>
                </div>
                <p className="text-xs text-muted-foreground">Saved bank details stay as they are unless you replace them.</p>
                <button type="button" className={btn2Cls} onClick={() => { setWire(emptyWire()); setReplaceBank(true) }} data-testid="button-replace-bank">Replace bank details</button>
              </div>
            ) : (
              <>
                {replaceBank && <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-xs"><span>Entering new bank details. The full set is required.</span><button type="button" className="underline" onClick={() => { setWire(emptyWire()); setReplaceBank(false) }} data-testid="button-cancel-replace">Keep current</button></div>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bank name"><input required className={inputCls} value={wire.bankName} onChange={(e) => wu('bankName', e.target.value)} data-testid="input-bank-name" /></Field>
                  <Field label="Account holder name"><input required className={inputCls} value={wire.accountHolder} onChange={(e) => wu('accountHolder', e.target.value)} data-testid="input-account-holder" /></Field>
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bank address</p>
                <AddressFields prefix="bank" v={wire.bankAddress} set={(a) => setWire({ ...wire, bankAddress: a })} />
                <fieldset className="flex gap-4 text-sm">
                  <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Account type</legend>
                  {(['checking', 'savings'] as const).map((t) => <label key={t} className="flex items-center gap-2 capitalize"><input type="radio" name="acct-type" checked={wire.accountType === t} onChange={() => setWire({ ...wire, accountType: t })} data-testid={`radio-${t}`} />{t}</label>)}
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Wire routing (ABA)" hint="9 digits, from your bank's wire instructions"><input required inputMode="numeric" maxLength={9} className={inputCls + ' font-mono'} value={wire.routingNumber} onChange={(e) => wu('routingNumber', e.target.value.replace(/\D/g, ''))} data-testid="input-routing" /></Field>
                  <Field label="Account number"><input required inputMode="numeric" maxLength={17} className={inputCls + ' font-mono'} value={wire.accountNumber} onChange={(e) => wu('accountNumber', e.target.value.replace(/\D/g, ''))} data-testid="input-account" /></Field>
                  <Field label="Confirm account number"><input required inputMode="numeric" maxLength={17} onPaste={(e) => e.preventDefault()} className={inputCls + ' font-mono'} value={wire.accountConfirmation} onChange={(e) => wu('accountConfirmation', e.target.value.replace(/\D/g, ''))} data-testid="input-account-confirm" /></Field>
                </div>
                <Field label="Intermediary or further-credit instructions (optional)" hint="Only if your bank provided them."><textarea rows={3} className={inputCls} value={wire.instructions} onChange={(e) => wu('instructions', e.target.value)} data-testid="input-instructions" /></Field>
              </>
            )}
          </Step>

          <Step n="03" title="Signed W-9" desc={<>Upload the completed and signed official IRS form as a PDF, 2 MB or smaller. A typed statement or custom certification is not accepted.</>}>
            {data.w9Received && <p className="text-sm" data-testid="text-w9-received">A signed W-9 is on file. Upload a new one only if it changed.</p>}
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(e) => void onPick(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-2 file:text-sm" data-testid="input-w9" />
            {file && <p className="text-xs text-muted-foreground" data-testid="text-w9-file">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
            {fileErr && <p role="alert" className="text-sm text-destructive">{fileErr}</p>}
          </Step>

          {err && <p role="alert" data-testid="text-error" className="text-sm text-destructive">{err}</p>}
          <button className={btnCls + ' w-full sm:w-auto'} disabled={busy || stale} data-testid="button-submit-onboarding">{busy ? 'Submitting...' : initial ? 'Submit payment details' : 'Save changes'}</button>
        </form>
        <PrivacyNote />
      </main>
    </div>
  )
}
