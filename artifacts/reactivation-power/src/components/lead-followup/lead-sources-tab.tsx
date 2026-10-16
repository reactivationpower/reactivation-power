// @ts-nocheck
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react'
import { formatDateTime } from '@workspace/shared/format'
import { timeAgo } from '@workspace/shared/lead-followup'
import {
  DEFAULT_FIELD_KEYS,
  flattenPayload,
  GHL_FIELD_TABLE,
  GHL_SAMPLE_PAYLOAD,
  WEBHOOK_FIELD_LABELS,
  WEBHOOK_FIELDS,
  type WebhookField,
} from '@workspace/shared/lead-webhooks'
import { regenerateWebhookUrl, saveWebhookFieldMapping, sendTestWebhook } from '@/app/actions/lead-followup'
import { useRouter } from '@/hooks/use-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * "Lead sources" tab of a campaign: the intake URL any form tool can POST
 * to, the field mapping, the last 20 payloads received and the GoHighLevel
 * walkthrough. Everything the owner needs to wire an ad up without help.
 */

interface WebhookEvent {
  id: string
  receivedAt: string
  source: string
  contentType: string | null
  payload: Record<string, unknown>
  outcome: 'created' | 'updated' | 'rejected'
  error: string | null
  leadId: string | null
}

interface Props {
  campaignId: string
  campaignName: string
  webhookUrl: string
  fieldMapping: Record<string, string>
  events: WebhookEvent[]
  archived: boolean
  now: number
}

const SOURCE_LABELS: Record<string, string> = {
  webhook: 'Form / webhook',
  gohighlevel: 'GoHighLevel',
  test: 'Test',
}

const OUTCOME: Record<WebhookEvent['outcome'], { label: string; className: string; Icon: typeof Check }> = {
  created: { label: 'New lead', className: 'bg-emerald-100 text-emerald-900 border-emerald-200', Icon: CheckCircle2 },
  updated: { label: 'Updated lead', className: 'bg-sky-100 text-sky-900 border-sky-200', Icon: Check },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-900 border-red-200', Icon: XCircle },
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])
  return {
    copied,
    copy: async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
      } catch {
        window.prompt('Copy this URL', text)
      }
    },
  }
}

export function LeadSourcesTab({ campaignId, campaignName, webhookUrl, fieldMapping, events, archived, now }: Props) {
  const router = useRouter()
  const { copied, copy } = useCopy()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'regenerate' | 'test' | 'mapping' | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [mapping, setMapping] = useState<Record<string, string>>(fieldMapping ?? {})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showGhl, setShowGhl] = useState(events.length === 0)

  useEffect(() => setMapping(fieldMapping ?? {}), [fieldMapping])

  const mappingDirty = useMemo(
    () => WEBHOOK_FIELDS.some((f) => (mapping[f] ?? '').trim() !== (fieldMapping?.[f] ?? '')),
    [mapping, fieldMapping],
  )

  /** Keys seen in recent payloads, offered as suggestions in the mapping inputs. */
  const seenKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const e of events) for (const k of Object.keys(flattenPayload(e.payload))) if (k !== '_raw') keys.add(k)
    return Array.from(keys).sort()
  }, [events])

  function run(kind: 'regenerate' | 'test' | 'mapping', fn: () => Promise<{ error?: string } & Record<string, unknown>>, onOk: (res: any) => string) {
    setNotice(null)
    setBusy(kind)
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.error) setNotice({ kind: 'error', text: res.error })
        else {
          setNotice({ kind: 'ok', text: onOk(res) })
          router.refresh()
        }
      } finally {
        setBusy(null)
      }
    })
  }

  const regenerate = () => {
    setConfirmRegenerate(false)
    run('regenerate', () => regenerateWebhookUrl(campaignId), () => 'New URL issued. The old one no longer works — update it wherever it was pasted.')
  }
  const sendTest = () => run('test', () => sendTestWebhook(campaignId), (res) => (res.outcome === 'updated' ? 'Test received — the earlier test lead was updated.' : 'Test received — a "Test Lead" was added to this campaign.'))
  const saveMapping = () => run('mapping', () => saveWebhookFieldMapping(campaignId, mapping), () => 'Field mapping saved. It applies to the next payload received.')

  return (
    <div className="mt-6 space-y-8">
      {notice ? (
        <p
          role="status"
          className={cn('rounded-md border px-4 py-2 text-sm', notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900')}
          data-testid="text-sources-notice"
        >
          {notice.text}
        </p>
      ) : null}

      {/* ---- URL ---- */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">This campaign&rsquo;s webhook URL</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Point your form tool, Zapier, Facebook lead-form connector or GoHighLevel workflow at this address. Every submission
          becomes a lead in <span className="font-medium text-foreground">{campaignName}</span> the moment it arrives. Anyone with the URL can add leads, so treat it like a password.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground" title={webhookUrl} data-testid="text-webhook-url">
            {webhookUrl}
          </code>
          <Button type="button" variant="outline" className="gap-2" onClick={() => copy(webhookUrl)} data-testid="button-copy-webhook-url">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" className="gap-2" disabled={pending || archived} onClick={sendTest} data-testid="button-send-test-webhook">
            {busy === 'test' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send a test
          </Button>
          {confirmRegenerate ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">The current URL stops working immediately.</span>
              <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={regenerate} data-testid="button-confirm-regenerate">
                Yes, regenerate
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRegenerate(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" className="gap-2" disabled={pending} onClick={() => setConfirmRegenerate(true)} data-testid="button-regenerate-webhook-url">
              {busy === 'regenerate' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Regenerate URL
            </Button>
          )}
        </div>
        {archived ? <p className="mt-2 text-xs text-muted-foreground">This campaign is archived, so the URL answers &ldquo;410 Gone&rdquo; until it is restored.</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Send a <span className="font-mono">POST</span> with JSON or form fields. Replies: <span className="font-mono">201</span> new lead, <span className="font-mono">200</span> existing lead updated (same phone), <span className="font-mono">422</span> a name or phone was missing, <span className="font-mono">429</span> more than 60 requests a minute.
        </p>
      </section>

      {/* ---- Field mapping ---- */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Field mapping</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Common names (<span className="font-mono">first_name</span>, <span className="font-mono">firstName</span>, <span className="font-mono">phone</span>, <span className="font-mono">email</span>…) are picked up automatically.
          Only fill a box when your form uses a different name. Nested fields work with dots, e.g. <span className="font-mono">answers.q3</span>.
        </p>
        <datalist id={`webhook-keys-${campaignId}`}>
          {seenKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {WEBHOOK_FIELDS.map((field: WebhookField) => (
            <div key={field} className="space-y-1">
              <Label htmlFor={`map-${field}`} className="text-sm">
                {WEBHOOK_FIELD_LABELS[field]}
                {field === 'firstName' || field === 'phone' ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Input
                id={`map-${field}`}
                list={`webhook-keys-${campaignId}`}
                value={mapping[field] ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                placeholder={`auto: ${DEFAULT_FIELD_KEYS[field].slice(0, 3).join(', ')}…`}
                className="font-mono text-xs"
                data-testid={`input-map-${field}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" disabled={pending || !mappingDirty} onClick={saveMapping} data-testid="button-save-mapping">
            {busy === 'mapping' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save mapping
          </Button>
          {mappingDirty ? (
            <Button type="button" variant="ghost" onClick={() => setMapping(fieldMapping ?? {})}>
              Discard changes
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">* A first name (or full name) and a phone are required for a lead to be created.</span>
        </div>
      </section>

      {/* ---- Received log ---- */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Last 20 received</h2>
          <span className="text-xs text-muted-foreground">Newest first · rejected payloads show why</span>
        </div>
        {events.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="font-medium text-foreground">Nothing received yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Press &ldquo;Send a test&rdquo; above to see what a delivery looks like here.</p>
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => {
                  const o = OUTCOME[e.outcome] ?? OUTCOME.rejected
                  const open = expanded === e.id
                  return (
                    <Fragment key={e.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded(open ? null : e.id)} data-testid={`row-webhook-event-${e.id}`}>
                        <TableCell>
                          <span className="text-sm text-foreground" title={formatDateTime(e.receivedAt)}>{timeAgo(e.receivedAt, now)}</span>
                          <p className="text-xs text-muted-foreground">{e.contentType ?? 'no content type'}</p>
                        </TableCell>
                        <TableCell className="text-sm">{SOURCE_LABELS[e.source] ?? e.source}</TableCell>
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', o.className)} data-testid={`badge-outcome-${e.outcome}`}>
                            <o.Icon className="size-3" />
                            {o.label}
                          </span>
                          {e.error ? (
                            <p className="mt-1 flex items-start gap-1 text-xs text-red-900">
                              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                              <span>{e.error}</span>
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={4}>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground" data-testid={`text-payload-${e.id}`}>
                              {JSON.stringify(e.payload, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---- GoHighLevel guide ---- */}
      <section className="rounded-lg border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
          onClick={() => setShowGhl((v) => !v)}
          aria-expanded={showGhl}
          data-testid="button-toggle-ghl-guide"
        >
          <span>
            <span className="block text-lg font-semibold text-foreground">Set up GoHighLevel</span>
            <span className="block text-sm text-muted-foreground">A workflow that sends every new ad lead here. No API key needed — GoHighLevel pushes to us.</span>
          </span>
          <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', showGhl && 'rotate-180')} />
        </button>
        {showGhl ? <GhlGuide webhookUrl={webhookUrl} campaignName={campaignName} copy={copy} copied={copied} /> : null}
      </section>
    </div>
  )
}

export function GhlGuide({ webhookUrl, campaignName, copy, copied }: { webhookUrl: string; campaignName: string; copy: (t: string) => void; copied: boolean }) {
  const tag = campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-lead'
  const steps: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: 'Find the exact GoHighLevel form for this offer',
      body: (
        <>
          In the correct practice, open <b>Sites → Forms</b> and note the exact name of the form for this offer.
          Check that it collects a name and phone number. Keep its published page or public form link open in another tab.
          These steps are for a form created in GoHighLevel, even if it is embedded on your website.
          For contacts arriving through tags instead, use the separate tag route below.
        </>
      ),
    },
    {
      title: 'Create the workflow',
      body: (
        <>
          In GoHighLevel open <b>Automation → Workflows → Create Workflow → Start from scratch</b>. Name it something like
          &ldquo;Send {campaignName} leads to Patient Pipeline&rdquo;. Use a dedicated workflow, not an existing nurturing workflow.
        </>
      ),
    },
    {
      title: 'Add the trigger',
      body: (
        <>
          Click <b>Add New Trigger</b> and choose <b>Form Submitted</b>. Add the <b>Form Is</b> filter and select the exact
          form name you noted above. Save the trigger. This keeps unrelated forms out of this campaign.
        </>
      ),
    },
    {
      title: 'Add the Webhook action',
      body: (
        <>
          Click the <b>+</b> under the trigger, choose the ordinary <b>Webhook</b> action (not Custom Webhook),
          set <b>Method</b> to <Chip>POST</Chip> and paste this campaign&rsquo;s private address as the <b>URL</b>:
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs" title={webhookUrl}>{webhookUrl}</code>
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => copy(webhookUrl)} data-testid="button-copy-webhook-url-ghl">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </span>
          <span className="mt-2 block">Leave Headers, query parameters and Custom Data empty for the basic setup.
            Standard contact fields, including name and phone, are sent automatically; no manual mapping or JSON is needed. Click <b>Save Action</b>.</span>
        </>
      ),
    },
    {
      title: 'Optional: pass the requested time and a note',
      body: (
        <>
          Still on the Webhook action, open <b>Custom Data</b> and add two rows. Key <Chip>requested_time</Chip> with the value set to the custom field that
          holds their preferred day/time, and key <Chip>message</Chip> with their form comment. Skip this if your form doesn&rsquo;t ask.
        </>
      ),
    },
    {
      title: 'Publish and submit the actual form',
      body: (
        <>
          Switch the workflow to <b>Publish</b> and save. Open the actual published page or public link for the same form
          selected in <b>Form Is</b> and submit it once with your own name and a phone number you control, not patient details.
          Existing emails or texts may fire, so let your office know first. Adding a tag does not test this form trigger.
          Return to this campaign and refresh. In Connection settings, check &ldquo;Last 20 received&rdquo; for a new successful
          GoHighLevel delivery at the time of your submission, then open the <b>Leads</b> tab and match the name and phone.
          Reusing the same phone may update an existing lead rather than add a row.
          An internal test or an older receipt does not prove this new form submission arrived.
          If it is missing, check the exact Form Is selection, published workflow and Webhook URL before trying again.
        </>
      ),
    },
  ]

  return (
    <div className="min-w-0 border-t border-border px-4 py-5 sm:px-6">
      <ol className="space-y-5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span>
            <div className="min-w-0 text-sm text-foreground">
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <details className="mt-6 text-sm" data-testid="ghl-tag-route">
        <summary className="cursor-pointer font-medium text-foreground">Separate route: contacts sent by a tag (not a native form trigger)</summary>
        <p className="mt-2 text-muted-foreground">
          Use this only if your lead source already adds a specific campaign tag, for example to Facebook leads arriving in GoHighLevel.
          Confirm that automation applies the intended tag; do not assume it does.
          In a dedicated workflow, choose <b>Contact Tag</b>, filter <b>Tag added</b>, and select that exact tag
          (for example <Chip>{tag}</Chip>) instead of Form Submitted.
          Use the same ordinary <b>Webhook</b> action, <b>POST</b>, private campaign URL and automatic standard fields described above.
          Save the action, <b>Publish</b> and save the workflow.
        </p>
        <p className="mt-2 text-muted-foreground">
          To test this tag route, use a clean contact with your own name and phone that does not already have the selected tag.
          Add that exact tag, then refresh this campaign and match a new successful delivery and the lead&rsquo;s name and phone.
          This tests the tag workflow only, not the original form or the automation that applies the tag.
          To check the full route, submit the original lead form and confirm it applies the tag and produces a new matching delivery.
          Existing messages may fire; do not use patient details. An older receipt or internal test is not proof of this test.
        </p>
      </details>

      <h3 className="mt-8 text-sm font-semibold text-foreground">What GoHighLevel sends, and where it lands</h3>
      <p className="mt-1 text-sm text-muted-foreground">These are the standard fields on a GoHighLevel workflow webhook. They map on their own — no field mapping needed.</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GoHighLevel field</TableHead>
              <TableHead>Lands in</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GHL_FIELD_TABLE.map((row) => (
              <TableRow key={row.ghlKey}>
                <TableCell className="font-mono text-xs">{row.ghlKey}</TableCell>
                <TableCell className="text-sm">{row.field ? WEBHOOK_FIELD_LABELS[row.field] : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">Example payload</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{JSON.stringify(GHL_SAMPLE_PAYLOAD, null, 2)}</pre>
      </details>
      <p className="mt-4 text-xs text-muted-foreground">
        We never ask for your GoHighLevel API key. Leads flow one way — from GoHighLevel to this campaign — and nothing is written back.
      </p>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
}
