import { useState } from 'react'
import { Link } from 'wouter'
import { useMutation } from '@tanstack/react-query'
import { applyAffiliate } from '@/app/actions/affiliates'
import { PublicShell } from '@/components/affiliates/public-shell'
import { Field, btnCls, inputCls } from '@/components/affiliates/shared'

export default function AffiliatesApplyPage() {
  const [businessName, setName] = useState('')
  const [email, setEmail] = useState('')
  const m = useMutation({ mutationFn: applyAffiliate })
  return (
    <PublicShell title="Refer practices. Get paid on what they collect." lead="Apply with your business name and inbox. Applications stay pending until a Patient Pipeline administrator approves them.">
      {m.isSuccess ? (
        <div data-testid="status-applied" className="space-y-2">
          <h2 className="text-lg font-semibold">Application received</h2>
          <p className="text-sm text-muted-foreground">Your application is pending review. If approved, an access link will be sent to your inbox.</p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ businessName: businessName.trim(), email: email.trim() }) }}>
          <Field label="Business name"><input data-testid="input-business" required className={inputCls} value={businessName} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Inbox email" hint="This inbox is your only way in. There are no passwords."><input data-testid="input-email" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {m.isError ? <p role="alert" className="text-sm text-destructive">{(m.error as Error).message}</p> : null}
          <button data-testid="button-apply" className={btnCls + ' w-full'} disabled={m.isPending}>{m.isPending ? 'Submitting...' : 'Submit application'}</button>
          <p className="text-center text-sm text-muted-foreground">Already approved? <Link href="/affiliates/access" className="underline">Request access</Link></p>
        </form>
      )}
    </PublicShell>
  )
}
