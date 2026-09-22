// @ts-nocheck
import { useState } from 'react'
import { Check, Copy, Loader2, Send } from 'lucide-react'

import { sendCardUpdateLink } from '@/app/actions/customer-billing'
import { Button } from '@/components/ui/button'
import { notifyDone, notifyError } from '@/lib/notify'

/** Admin: email the customer a tokenized "add a new card" link and show it for copying. */
export function SendCardLinkButton({ linkId }: { linkId: string }) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ url: string; expiresAt: string; emailed: boolean; sentTo: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function send() {
    setBusy(true)
    try {
      const res = await sendCardUpdateLink({ linkId })
      if (!res?.ok) {
        notifyError(res?.error || 'Could not create the link.')
        return
      }
      setSent(res)
      if (res.emailed) notifyDone('Card update link emailed', `Sent to ${res.sentTo}.`)
      else notifyError('Link created but the email failed', 'Copy the link below and send it yourself.')
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Could not create the link.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!sent) return
    await navigator.clipboard.writeText(sent.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button size="sm" variant="outline" onClick={send} disabled={busy} data-testid="button-send-card-link">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send card update link
        </Button>
      </div>
      {sent ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs" data-testid="card-link-result">
          <code className="min-w-0 flex-1 truncate">{sent.url}</code>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copy} aria-label="Copy link">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
          <span className="shrink-0 text-muted-foreground">
            expires {new Date(sent.expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
          </span>
        </div>
      ) : null}
    </div>
  )
}
