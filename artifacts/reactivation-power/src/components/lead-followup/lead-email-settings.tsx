import { useEffect, useState } from 'react'
import { action } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Settings = { enabled: boolean; recipient: string }
type Result = { settings?: Settings; error?: string }
const loadSettings = action<Result>('lead-notifications', 'getLeadEmailSettings')
const saveSettings = action<Result>('lead-notifications', 'saveLeadEmailSettings')

export function LeadEmailSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    loadSettings().then(result => {
      if (!active) return
      if (result.settings) setSettings(result.settings)
      else setError(result.error || 'Unable to load notification settings.')
    }).catch(() => { if (active) setError('Unable to load notification settings. Please reload and try again.') })
    return () => { active = false }
  }, [])
  if (!settings) return <p role={error ? 'alert' : 'status'} className="text-sm text-muted-foreground">{error || 'Loading notification settings…'}</p>
  return <form className="flex max-w-lg flex-col gap-3" onSubmit={async e => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const result = await saveSettings(settings)
      if (result.settings) { setSettings(result.settings); setSaved(true) }
      else setError(result.error || 'Unable to save notification settings.')
    } catch { setError('Unable to save notification settings. Please try again.') }
    finally { setSaving(false) }
  }}>
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={settings.enabled} disabled={saving} onChange={e => { setSettings({ ...settings, enabled: e.target.checked }); setSaved(false) }} />
      Email my office when new leads arrive
    </label>
    <label htmlFor="lead-notification-email" className="text-sm font-medium">Notification email address</label>
    <Input id="lead-notification-email" type="email" autoComplete="email" maxLength={254} required={settings.enabled} disabled={saving} value={settings.recipient} onChange={e => { setSettings({ ...settings, recipient: e.target.value }); setSaved(false) }} />
    <p className="text-xs leading-relaxed text-muted-foreground">Optional and off by default. New campaign leads trigger an email; each CSV upload sends one summary, not one email per lead. Duplicate submissions and test webhooks do not send alerts. Emails contain a sign-in link, never contact or treatment details. Use an address authorized to receive your office’s notifications.</p>
    <p className="text-xs text-muted-foreground">Turning alerts off cancels pending emails. An email already being sent may still arrive.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm text-green-700">Notification preferences saved.</p>}
    <Button type="submit" disabled={saving} className="self-start">{saving ? 'Saving…' : 'Save notifications'}</Button>
  </form>
}