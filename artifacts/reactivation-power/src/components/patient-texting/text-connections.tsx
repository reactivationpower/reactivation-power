import { useState } from 'react'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { action } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type Connection = {
  kind: 'messaging' | 'ai'; provider: 'ghl' | 'independent' | 'openai'; accountId: string; updatedAt: string
  credential: string; ready: false; state: string; reason: string
}
const saveTextConnection = action<any>('patient-texting', 'saveTextConnection')
const revokeTextConnection = action<any>('patient-texting', 'revokeTextConnection')

const PROVIDER: Record<string, string> = { ghl: 'GoHighLevel', independent: 'Independent business texting', openai: 'OpenAI' }
const ACCOUNT_LABEL: Record<string, string> = { ghl: 'GHL location ID (your office location)', independent: 'Office-owned provider account ID', openai: 'Office-owned AI project ID' }
const fmt = (iso: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export function TextConnections({ isDemo, connections, onChange }: { isDemo: boolean; connections: Connection[]; onChange: (r: any) => void }) {
  return (
    <section className="space-y-4" aria-label="Provider connections">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Office-owned connections</h3>
        <p className="mt-1 text-xs text-muted-foreground">Your office pays each provider directly. Saving stores the credential encrypted; it makes no network call and does not verify the account, enable texting, or start billing. Verification and commissioning are not available yet.</p>
      </div>
      {isDemo ? (
        <div className="flex gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />Demo accounts cannot store real credentials. Connection storage is available on office accounts only.
        </div>
      ) : (
        <div className="grid gap-4">
          <ConnectionCard kind="messaging" providers={['ghl', 'independent']} current={connections.find(c => c.kind === 'messaging')} onChange={onChange} />
          <ConnectionCard kind="ai" providers={['openai']} current={connections.find(c => c.kind === 'ai')} onChange={onChange} />
        </div>
      )}
    </section>
  )
}

function ConnectionCard({ kind, providers, current, onChange }: { kind: 'messaging' | 'ai'; providers: Connection['provider'][]; current?: Connection; onChange: (r: any) => void }) {
  const [provider, setProvider] = useState<Connection['provider']>(current?.provider ?? providers[0])
  const [accountId, setAccountId] = useState(current?.accountId ?? '')
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const title = kind === 'messaging' ? 'Messaging provider' : 'Production AI (direct billed)'

  const run = async (fn: () => Promise<any>, done: string) => {
    setBusy(true); setError(''); setMsg('')
    try { onChange(await fn()); setMsg(done) }
    catch (e: any) { setError(e?.message || 'That did not work. Please try again.') }
    finally { setCredential(''); setBusy(false); setConfirmRevoke(false) }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-accent" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {current ? <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Stored, {current.state}, not ready</span>
          : <span className="ml-auto text-xs text-muted-foreground">Nothing stored</span>}
      </div>
      {current ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Provider</dt><dd>{PROVIDER[current.provider] ?? current.provider}</dd>
          <dt className="text-muted-foreground">Account</dt><dd className="font-mono">{current.accountId}</dd>
          <dt className="text-muted-foreground">Credential</dt><dd>{current.credential}</dd>
          <dt className="text-muted-foreground">Updated</dt><dd>{fmt(current.updatedAt)}</dd>
          <dt className="text-muted-foreground">Status</dt><dd>{current.reason}</dd>
        </dl>
      ) : null}
      <form className="mt-3 grid gap-2" autoComplete="off" onSubmit={e => {
        e.preventDefault()
        run(() => saveTextConnection({ kind, provider, accountId: accountId.trim(), credential }), 'Credential stored. Not verified; texting and billing remain inactive.')
      }}>
        {providers.length > 1 ? (
          <select className="h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm" value={provider} disabled={busy} onChange={e => setProvider(e.target.value as Connection['provider'])} aria-label="Provider">
            {providers.map(p => <option key={p} value={p}>{PROVIDER[p]}</option>)}
          </select>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">{ACCOUNT_LABEL[provider]}
          <Input value={accountId} onChange={e => setAccountId(e.target.value)} disabled={busy} className="h-8 font-mono" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">{current ? 'Replace credential' : 'Credential'}
          <Input type="password" autoComplete="new-password" value={credential} onChange={e => setCredential(e.target.value)} disabled={busy} className="h-8" />
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {msg ? <p role="status" className="text-sm text-muted-foreground">{msg}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy || !accountId.trim() || !credential}>{busy ? 'Saving…' : 'Store securely'}</Button>
          {current ? (confirmRevoke ? <>
            <span className="text-xs">Remove the stored credential?</span>
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => run(() => revokeTextConnection(kind), 'Credential removed.')}>Remove</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRevoke(false)}>Cancel</Button>
          </> : <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRevoke(true)}>Revoke</Button>) : null}
        </div>
      </form>
    </div>
  )
}
