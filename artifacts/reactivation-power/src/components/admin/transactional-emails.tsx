// @ts-nocheck

import { useEffect, useState, useTransition } from 'react'
import {
  CheckCircle2,
  Loader2,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Send,
  Smartphone,
  XCircle,
} from 'lucide-react'
import {
  listEmailLog,
  listTransactionalTemplates,
  sendTestEmail,
  type EmailLogRow,
  type TransactionalTemplatePreview,
} from '@/app/actions/mail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notifyDone, notifyError } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { EmailTrackingNotice } from './email-tracking-notice'

/**
 * Transactional (account) emails: the branded templates the app sends on
 * its own — login links, invites, receipts, billing notices — with a live
 * preview, a test send, and the delivery log fed by Resend's webhook.
 */
export function TransactionalEmails({ adminEmail }: { adminEmail?: string | null }) {
  const [from, setFrom] = useState('')
  const [templates, setTemplates] = useState<TransactionalTemplatePreview[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [testTo, setTestTo] = useState(adminEmail ?? '')
  const [sending, startSend] = useTransition()
  const [log, setLog] = useState<{ rows: EmailLogRow[]; total: number } | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  const [deliveryTrackingConfigured, setDeliveryTrackingConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    listTransactionalTemplates()
      .then((r) => {
        setFrom(r.from)
        setDeliveryTrackingConfigured(r.deliveryTrackingConfigured)
        setTemplates(r.templates)
        setSelectedId((id) => id || r.templates[0]?.id || '')
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load templates'))
  }, [])

  async function refreshLog() {
    setLogLoading(true)
    try {
      setLog(await listEmailLog({ limit: 50 }))
    } catch (err) {
      notifyError('Could not load the send log', err instanceof Error ? err.message : undefined)
    } finally {
      setLogLoading(false)
    }
  }
  useEffect(() => {
    void refreshLog()
    const timer = window.setInterval(() => { void refreshLog() }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const template = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null

  function sendTest() {
    if (!template) return
    startSend(async () => {
      try {
        const fd = new FormData()
        fd.set('template', template.id)
        fd.set('to', testTo)
        const result = await sendTestEmail(fd)
        if (result.ok) notifyDone('Test email accepted by Resend', 'Check the delivery log and ask the recipient to confirm receipt.')
        else notifyError('Send failed', result.error ?? 'Resend rejected the message')
        await refreshLog()
      } catch (err) {
        notifyError('Send failed', err instanceof Error ? err.message : undefined)
      }
    })
  }

  if (loadError) {
    return <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium text-foreground">Sent from</span>{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{from || '…'}</code>
        <span className="ml-2 text-muted-foreground">
          via Resend. Open and click tracking are per-domain switches in the Resend dashboard; events land in the log below through the webhook.
        </span>
      </div>
      <EmailTrackingNotice configured={deliveryTrackingConfigured} />

      {/* Template picker */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">Account emails</span>
          <span className="text-xs text-muted-foreground">{templates.length} templates</span>
        </div>
        <div className="grid gap-1.5 p-2 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const active = template?.id === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-transparent text-foreground hover:bg-muted',
                )}
              >
                <span className="text-sm font-medium leading-5">{t.name}</span>
                <span className={cn('font-mono text-[11px]', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {t.id}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {template && (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">Subject</dt>
                <dd className="text-foreground">{template.subject}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">Preview text</dt>
                <dd className="text-foreground">{template.previewText}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">Sent when</dt>
                <dd className="text-muted-foreground">{template.description}</dd>
              </div>
            </dl>
            <form
              className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault()
                sendTest()
              }}
            >
              <label htmlFor="test-to" className="text-sm font-medium text-foreground sm:w-24 sm:shrink-0">
                Send a test
              </label>
              <Input
                id="test-to"
                type="email"
                required
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
                className="sm:max-w-xs"
              />
              <Button type="submit" disabled={sending || !testTo} className="gap-2">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send sample
              </Button>
            </form>
          </div>

          <div className="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">Live Preview</span>
              <div className="flex rounded-md border border-input">
                <button
                  type="button"
                  onClick={() => setDevice('desktop')}
                  aria-pressed={device === 'desktop'}
                  className={cn(
                    'flex items-center gap-1.5 rounded-l-[5px] px-3 py-1.5 text-sm font-medium transition-colors',
                    device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Monitor className="size-4" />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDevice('mobile')}
                  aria-pressed={device === 'mobile'}
                  className={cn(
                    'flex items-center gap-1.5 rounded-r-[5px] px-3 py-1.5 text-sm font-medium transition-colors',
                    device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Smartphone className="size-4" />
                  Mobile
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-muted p-4">
              <iframe
                title={`Preview: ${template.name}`}
                srcDoc={template.html}
                sandbox=""
                className={cn(
                  'h-full min-h-[520px] rounded-md border border-border bg-background shadow-sm transition-all',
                  device === 'desktop' ? 'w-full' : 'w-[375px] shrink-0',
                )}
              />
            </div>
          </div>
        </>
      )}

      {/* Send log */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            Recent sends
            {log ? <span className="ml-2 text-xs font-normal text-muted-foreground">{log.total} total</span> : null}
          </span>
          <Button variant="ghost" size="sm" onClick={refreshLog} disabled={logLoading} className="gap-1.5">
            <RefreshCw className={cn('size-3.5', logLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        {!log || log.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {log ? 'Nothing has been sent yet.' : 'Loading…'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Recipient</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Delivery details</th>
                  <th className="px-4 py-2 font-medium">Opened</th>
                  <th className="px-4 py-2 font-medium">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {log.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{fmt(r.createdAt)}</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.type}</code>
                      {r.test ? <Badge variant="outline" className="ml-1.5 text-[10px]">test</Badge> : null}
                    </td>
                    <td className="px-4 py-2 text-foreground">{r.recipient}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} error={r.error} />
                    </td>
                    <td className="min-w-[240px] px-4 py-2 text-muted-foreground">
                      {r.error || (r.status === 'sent' ? 'Accepted by Resend; inbox delivery not confirmed.' : r.status === 'delivered' ? 'Accepted by the recipient’s mail server; inbox placement not confirmed.' : '—')}
                      {r.lastEventAt && <div className="text-xs">Last event: {r.lastEvent} · {fmt(r.lastEventAt)}</div>}
                      {['failed', 'bounced', 'suppressed', 'complained'].includes(r.status) &&
                        ['portal_login_code', 'portal_password_setup', 'portal_welcome', 'admin_invite'].includes(r.type) && (
                          <div className="mt-1 text-xs text-destructive">
                            Check this registered email in account or caller settings, confirm inbox access, and resolve any Resend suppression before requesting a fresh code.
                          </div>
                        )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{r.openedAt ? fmt(r.openedAt) : '—'}</td>
                    <td className="max-w-[220px] truncate px-4 py-2 text-muted-foreground" title={r.lastClickedUrl ?? undefined}>
                      {r.clickedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <MousePointerClick className="size-3.5" />
                          {fmt(r.clickedAt)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  const failed = ['failed', 'bounced', 'suppressed', 'complained'].includes(status)
  return (
    <span
      title={error ?? undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        failed ? 'bg-destructive/10 text-destructive' : status === 'delivered' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      {failed ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
      {status === 'sent' ? 'accepted' : status}
    </span>
  )
}
