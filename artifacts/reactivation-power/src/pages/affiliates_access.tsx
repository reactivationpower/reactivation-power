import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { requestAffiliateAccess, verifyAffiliateAccess } from '@/app/actions/affiliates'
import { PublicShell } from '@/components/affiliates/public-shell'
import { Field, btnCls, inputCls } from '@/components/affiliates/shared'

export default function AffiliatesAccessPage() {
  const [, nav] = useLocation()
  const qc = useQueryClient()
  // Keep the initializer pure: StrictMode may invoke it twice.
  const [entry] = useState(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return {
      token: h.get('token') ?? (window.location.hash.length > 1 && !window.location.hash.includes('=') ? window.location.hash.slice(1) : ''),
      accessId: new URLSearchParams(window.location.search).get('accessId') ?? '',
      // Only one destination is ever preserved; anything else is ignored.
      next: new URLSearchParams(window.location.search).get('next') === 'onboarding' ? 'onboarding' as const : undefined,
    }
  })
  const token = useRef(entry.token)
  const accessId = useRef(entry.accessId)
  const [hasToken, setHasToken] = useState(Boolean(entry.token))
  useEffect(() => { if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search) }, [])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      if (hasToken) {
        const r = await verifyAffiliateAccess({ email: email.trim(), token: token.current })
        if (r.ok) { token.current = ''; qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('affiliate') }); nav(entry.next === 'onboarding' ? '/affiliates/onboarding' : '/affiliates'); return }
        // A typo must not discard still-valid inbox proof; the server decides single-use/expiry.
        setErr(r.error ?? 'This link is invalid or expired. Request a new one.')
      } else {
        await requestAffiliateAccess({ email: email.trim(), ...(accessId.current ? { accessId: accessId.current } : {}), ...(entry.next ? { next: entry.next } : {}) })
        setSent(true)
      }
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <PublicShell title={hasToken ? 'Confirm your inbox' : 'Get your access link'} lead={hasToken ? 'Enter the email address this link was sent to. The link works only for that inbox.' : 'Enter your partner email. If it is approved, a one-time access link arrives in that inbox.'}>
      {sent ? (
        <div data-testid="status-sent" className="space-y-2">
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">If that address belongs to an approved partner, a link is on its way.</p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Inbox email"><input data-testid="input-email" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {err ? <p role="alert" data-testid="text-error" className="text-sm text-destructive">{err}</p> : null}
          {err && hasToken ? <button type="button" className="text-sm underline" onClick={() => { token.current = ''; setHasToken(false); setErr('') }}>Request a fresh link</button> : null}
          <button data-testid="button-submit" className={btnCls + ' w-full'} disabled={busy}>{busy ? 'Working...' : hasToken ? 'Open my report' : 'Email me a link'}</button>
        </form>
      )}
    </PublicShell>
  )
}
