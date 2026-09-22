// @ts-nocheck
import { useState } from 'react'
import { Link, useSearch } from 'wouter'
import { Loader2, Mail } from 'lucide-react'

import { requestBillingLink } from '@/app/actions/customer-billing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

/**
 * Public: ask for the billing link by email. Reached from the login notice
 * when access is paused, so it must work without a session.
 */
export default function BillingRequestPage() {
  const search = new URLSearchParams(useSearch())
  const prefill = search.get('email') ?? ''
  const { loading, error } = usePageData<any>('/billing', { email: prefill })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  return <RequestForm key={prefill} initialEmail={prefill} />
}

function RequestForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await requestBillingLink({ email })
      if (!res?.ok) setErr(res?.error || 'Something went wrong.')
      else setMessage(res.message)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-14">
        <header className="flex flex-col items-center gap-4 text-center">
          <Link href="/">
            <img src="/images/logo.png" alt="Reactivation Power" width={1177} height={480} className="h-12 w-auto" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Your billing page</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the email on your account and we will send you a secure link to pay your balance, update your card, or review your agreement.
            </p>
          </div>
        </header>
        {message ? (
          <div role="status" data-testid="billing-link-sent" className="rounded-lg border border-border bg-card p-5 text-sm">
            <p className="flex items-start gap-2">
              <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{message} Check your spam folder if it does not arrive within a few minutes.</span>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billing-email">Account email</Label>
              <Input id="billing-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-billing-email" />
            </div>
            {err ? <p role="alert" className="text-sm text-destructive">{err}</p> : null}
            <Button type="submit" disabled={busy || !email} data-testid="button-send-billing-link">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Email me my billing link
            </Button>
          </form>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Signed in already? Owners can manage billing at <Link href="/portal/billing" className="underline">Portal → Billing</Link>.
        </p>
      </div>
    </main>
  )
}
