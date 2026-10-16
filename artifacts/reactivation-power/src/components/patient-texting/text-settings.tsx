import { useEffect, useState } from 'react'
import { action } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextConnections, type Connection } from './text-connections'

type Policy = {
  handling: 'team' | 'ai'; afterHours: boolean; timezone: string
  hours: { day: number; open: string; close: string }[]; closures: string[]; provider: 'ghl' | 'independent'
}
type SettingsResult = {
  policy: Policy; isOwner: boolean; mode: string; liveEnabled: boolean; providerReady: boolean
  modelReady: boolean; demoModelReady: boolean; blockers: string[]
  isDemo?: boolean; connections?: Connection[]
}
const getTextSettings = action<SettingsResult>('patient-texting', 'getTextSettings')
const saveTextSettings = action<SettingsResult>('patient-texting', 'saveTextSettings')

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']

function Choice({ checked, onSelect, title, body, disabled, name }: { checked: boolean; onSelect: () => void; title: string; body: string; disabled?: boolean; name: string }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${checked ? 'border-accent bg-accent/5' : 'border-border hover:bg-muted/40'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
      <input type="radio" name={name} className="mt-1 accent-[hsl(var(--accent))]" checked={checked} disabled={disabled} onChange={onSelect} />
      <span><span className="block font-medium text-foreground">{title}</span><span className="mt-0.5 block text-muted-foreground">{body}</span></span>
    </label>
  )
}

export function PatientTextSettings() {
  const [data, setData] = useState<SettingsResult | null>(null)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [closure, setClosure] = useState('')

  const load = () => {
    setError('')
    getTextSettings().then(r => { setData(r); setPolicy(structuredClone(r.policy)) })
      .catch(e => setError(e?.message || 'Unable to load texting settings.'))
  }
  useEffect(load, [])

  if (!data || !policy) {
    return error
      ? <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={load}>Retry</Button></div>
      : <div className="space-y-2" role="status" aria-label="Loading texting settings"><div className="h-16 animate-pulse rounded-lg bg-muted" /><div className="h-24 animate-pulse rounded-lg bg-muted" /></div>
  }
  const ro = !data.isOwner || saving
  const edit = (p: Partial<Policy>) => { setPolicy({ ...policy, ...p }); setSaved(false) }
  const dayRow = (d: number) => policy.hours.find(h => h.day === d)
  const setDay = (d: number, patch: Partial<{ open: string; close: string }> | null) => {
    const others = policy.hours.filter(h => h.day !== d)
    if (patch === null) return edit({ hours: others })
    const cur = dayRow(d) ?? { day: d, open: '09:00', close: '17:00' }
    edit({ hours: [...others, { ...cur, ...patch }].sort((a, b) => a.day - b.day) })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={async e => {
      e.preventDefault(); setSaving(true); setError(''); setSaved(false)
      try { const r = await saveTextSettings(policy); setData(r); setPolicy(structuredClone(r.policy)); setSaved(true) }
      catch (err: any) { setError(err?.message || 'Unable to save texting settings.') }
      finally { setSaving(false) }
    }}>
      <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="texting-readiness">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Live patient texting: disabled</p>
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Not ready to send</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">No patient messages are sent from this account. These items must be completed before production texting can be turned on:</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {data.blockers.map(b => <li key={b} className="flex gap-2 text-foreground"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-destructive/70" />{b}</li>)}
        </ul>
        <Button type="button" className="mt-4" size="sm" disabled title="Readiness requirements not met">Turn on live texting</Button>
      </div>

      {!data.isOwner ? <p className="text-sm text-muted-foreground">Only the office owner can change these settings.</p> : null}

      <fieldset className="space-y-2" disabled={ro}>
        <legend className="mb-2 text-sm font-medium text-foreground">Who handles patient replies during office hours</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="handling" checked={policy.handling === 'team'} onSelect={() => edit({ handling: 'team' })} title="Team Member" body="Staff read and answer every reply. Nothing is automated." />
          <Choice name="handling" checked={policy.handling === 'ai'} onSelect={() => edit({ handling: 'ai' })} title="AI Text Assistant" body="Drafts and sends first replies office-wide. Appointments stay pending until staff confirm." />
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={policy.afterHours} onChange={e => edit({ afterHours: e.target.checked })} />
          <span><span className="font-medium text-foreground">Let the AI Text Assistant reply after hours</span><span className="block text-muted-foreground">Separate from the daytime choice. Off means after-hours replies wait for the next opening.</span></span>
        </label>
      </fieldset>

      <fieldset className="space-y-3" disabled={ro}>
        <legend className="mb-2 text-sm font-medium text-foreground">Office hours</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Timezone</span>
          <select className="h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm" value={policy.timezone} onChange={e => edit({ timezone: e.target.value })}>
            {[...new Set([policy.timezone, ...ZONES])].map(z => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
          </select>
        </label>
        <div className="divide-y divide-border rounded-lg border border-border">
          {DAYS.map((name, d) => {
            const row = dayRow(d)
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <label className="flex w-32 items-center gap-2"><input type="checkbox" checked={!!row} onChange={e => setDay(d, e.target.checked ? {} : null)} />{name}</label>
                {row ? <>
                  <Input type="time" className="h-8 w-28" value={row.open} onChange={e => setDay(d, { open: e.target.value })} aria-label={`${name} open`} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="time" className="h-8 w-28" value={row.close} onChange={e => setDay(d, { close: e.target.value })} aria-label={`${name} close`} />
                </> : <span className="text-muted-foreground">Closed</span>}
              </div>
            )
          })}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Closures (holidays, office days off)</p>
          <div className="mt-1 flex gap-2">
            <Input type="date" className="h-8 w-44" value={closure} onChange={e => setClosure(e.target.value)} aria-label="Closure date" />
            <Button type="button" size="sm" variant="outline" disabled={!closure || policy.closures.includes(closure)} onClick={() => { edit({ closures: [...policy.closures, closure].sort() }); setClosure('') }}>Add closure</Button>
          </div>
          {policy.closures.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {policy.closures.map(c => <li key={c} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs">{c}
                <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${c}`} onClick={() => edit({ closures: policy.closures.filter(x => x !== c) })}>×</button></li>)}
            </ul>
          ) : <p className="mt-1 text-xs text-muted-foreground">No closures scheduled.</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={ro}>
        <legend className="mb-2 text-sm font-medium text-foreground">Text provider</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="provider" checked={policy.provider === 'ghl'} onSelect={() => edit({ provider: 'ghl' })} title="Your existing GoHighLevel texting" body="Uses the number and registration already on your GHL account. GHL bills your office directly for messages." />
          <Choice name="provider" checked={policy.provider === 'independent'} onSelect={() => edit({ provider: 'independent' })} title="Independent business texting" body="A separate SMS provider account owned by your office. The provider bills you directly." />
        </div>
        <p className="text-xs text-muted-foreground">Message costs are billed by the provider to your office, not through Patient Pipeline. Production AI replies require a separate office-owned AI connection, also billed directly. Credentials can be stored securely below. Provider verification and commissioning are not available yet, so a stored credential does not make texting or billing active.</p>
      </fieldset>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-muted-foreground">Texting settings saved. Live texting remains disabled.</p> : null}
      {data.isOwner ? <div><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save texting settings'}</Button></div> : null}
    </form>
    {data.isOwner ? <TextConnections isDemo={!!data.isDemo} connections={data.connections ?? []} onChange={r => { setData(r); setPolicy(p => p ?? structuredClone(r.policy)) }} /> : null}
    </div>
  )
}
