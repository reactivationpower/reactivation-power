// @ts-nocheck
import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, CheckCircle2, Clock, Copy, ExternalLink, Loader2, Send, Settings2, UserPlus } from 'lucide-react'
import { timeAgo } from '@workspace/shared/lead-followup'
import { saveCampaignLeadSource, sendTestWebhook } from '@/app/actions/lead-followup'
import { useRouter } from '@/hooks/use-router'
import { Button } from '@/components/ui/button'
import { GhlGuide } from '@/components/lead-followup/lead-sources-tab'
import { cn } from '@/lib/utils'

/**
 * Persistent top-of-campaign panel that walks an office owner through getting
 * their ad's lead form to send people into this campaign. Plain language only.
 * "Received" is only ever claimed from a real external delivery
 * (connectionSummary.lastExternalReceivedAt), never from an internal test.
 */

export type LeadSource = 'facebook' | 'ghl' | 'website' | 'unsure'

export const SOURCE_OPTIONS: { id: LeadSource; label: string; hint: string }[] = [
  { id: 'facebook', label: 'Facebook / Instagram', hint: 'People fill out a form right inside the ad (Instant Form).' },
  { id: 'ghl', label: 'GoHighLevel', hint: 'The form or funnel is built in GoHighLevel, or your Facebook leads already go there.' },
  { id: 'website', label: 'Our website', hint: 'The ad sends people to a page on your own website with a form.' },
  { id: 'unsure', label: "I'm not sure", hint: 'That is fine. We will show what to ask whoever runs your ads.' },
]

export const ZAPIER_FB_LINK = 'https://zapier.com/apps/facebook-lead-ads/integrations/webhook/1060616/post-new-facebook-lead-ads-to-a-webhook'

const FIELDS: [string, string, boolean][] = [
  ['first_name', 'First name', true],
  ['phone', 'Phone number', true],
  ['last_name', 'Last name', false],
  ['email', 'Email', false],
  ['requested_time', 'Preferred day / time', false],
  ['message', 'Comment or question', false],
  ['submitted_at', 'When they submitted', false],
]

const FIELD_TEXT =
  'Fields to send (names on the left):\n' +
  FIELDS.map(([k, l, r]) => `- ${k}: ${l}${r ? ' (required)' : ' (optional)'}`).join('\n')

function stepsFor(source: LeadSource): string[] {
  switch (source) {
    case 'facebook':
      return [
        'Facebook cannot send leads straight to us, and there is no Facebook setting to paste this address into. You need a connector in between.',
        'Option A, if you use GoHighLevel: connect your Facebook page in GoHighLevel (Settings > Integrations > Facebook) so Instant Form leads land there, then follow the GoHighLevel steps (choose GoHighLevel above).',
        'Option B, Zapier (or Make): create a Zap with trigger "Facebook Lead Ads - New Lead", pick your page and this ad\'s form.',
        'Add the action "Webhooks by Zapier - POST". Paste the connection address below as the URL and set Payload Type to "json".',
        'Under Data, add one row per field in the table below and pick the matching answer from the Facebook form.',
        'Turn the Zap on. Zapier and Make are separate services; their plans and fees may apply.',
      ]
    case 'website':
      return [
        'Do not just paste this address into your website. It only works if your form tool can send submissions to an outside address.',
        'Ask whoever manages your site which form tool it uses (for example WordPress with Gravity Forms or WPForms, Wix, Squarespace, Webflow, Jotform, Typeform).',
        'If the tool has a "webhook" or "send to URL" option, set it to send a POST to the connection address below, with the fields in the table.',
        'If it does not, connect it through Zapier or Make: trigger "new form submission", action "Webhooks - POST" to the address below. Their plans and fees may apply.',
        'Save and publish the form change.',
      ]
    case 'unsure':
      return [
        'Look at your ad: when someone taps it, do they fill in a form inside Facebook/Instagram, or go to a website page?',
        'If you are still not sure, press "Have someone else finish this" below and send it to whoever runs your ads or website. It includes every option.',
        'Once you know, come back and pick the matching option above so the steps get specific.',
      ]
    default:
      return []
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(t)
  }, [copied])
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(key)
      } catch {
        window.prompt('Copy this', text)
      }
    },
  }
}

export function buildHandoffText({ campaign, offerLine, webhookUrl, source }: { campaign: any; offerLine: string; webhookUrl: string; source: LeadSource }) {
  const label = SOURCE_OPTIONS.find((o) => o.id === source)?.label ?? "I'm not sure"
  const steps =
    source === 'ghl'
      ? [
          'In GoHighLevel: Automation > Workflows > Create Workflow > Start from scratch.',
          'Trigger: Form Submitted (this ad\'s form) or Contact Tag added.',
          'Action: Webhook, Method POST, URL = the connection address below. Publish.',
          'Optional Custom Data: requested_time and message.',
        ]
      : source === 'unsure'
        ? [...stepsFor('facebook').map((s) => `[Facebook form] ${s}`), ...stepsFor('website').map((s) => `[Website form] ${s}`)]
        : stepsFor(source)
  return [
    'Please connect our ad lead form to our calling tool (Reactivation Power).',
    'PRIVATE: this address lets anyone add leads. Keep it to yourself; do not post it anywhere public.',
    '',
    `Campaign: ${campaign.name}`,
    campaign.offerItems?.length ? `Offer: ${campaign.offerItems.filter(Boolean).join(', ')}` : null,
    offerLine ? `Price: ${offerLine}` : null,
    `Where people fill out the form: ${label}`,
    `Connection address (POST, JSON or form fields): ${webhookUrl}`,
    '',
    'Steps:',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    FIELD_TEXT,
    source === 'facebook' || source === 'unsure' ? `\nZapier reference: ${ZAPIER_FB_LINK}` : null,
    '',
    'To test: submit the real form once with your own name and phone. It shows as received in our campaign page within a minute.',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

interface Props {
  campaign: any
  webhookUrl: string
  offerLine: string
  connectionSummary: { lastExternalReceivedAt: string | null; lastInternalTestAt: string | null } | null
  nowMs: number
  initiallyOpen: boolean
  onOpenSettings: () => void
}

export function ConnectLeadsPanel({ campaign, webhookUrl, offerLine, connectionSummary, nowMs, initiallyOpen, onOpenSettings }: Props) {
  const router = useRouter()
  const { copied, copy } = useCopy()
  const received = connectionSummary?.lastExternalReceivedAt ?? null
  const internal = connectionSummary?.lastInternalTestAt ?? null
  const archived = campaign.status === 'archived'
  const [open, setOpen] = useState(initiallyOpen && !received)
  const [source, setSource] = useState<LeadSource>(campaign.leadSourceSetup ?? 'unsure')
  const [chosen, setChosen] = useState(Boolean(campaign.leadSourceSetup && campaign.leadSourceSetup !== 'unsure') || false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (campaign.leadSourceSetup) setSource(campaign.leadSourceSetup)
  }, [campaign.leadSourceSetup])

  // While waiting on a real submission, re-check every 10s so a delivery from
  // someone else (or another device) shows up without a reload.
  const refreshRef = useRef(router.refresh)
  refreshRef.current = router.refresh
  useEffect(() => {
    if (!open || received) return
    const t = setInterval(() => refreshRef.current(), 10000)
    return () => clearInterval(t)
  }, [open, received])

  function choose(next: LeadSource) {
    const prev = source
    const previouslyChosen = chosen
    setSource(next)
    setChosen(true)
    setNotice(null)
    setBusy('source')
    startTransition(async () => {
      try {
        const res = await saveCampaignLeadSource(campaign.id, next)
        if (res?.error) {
          setSource(prev)
          setChosen(previouslyChosen)
          setNotice({ kind: 'error', text: res.error })
        } else router.refresh()
      } catch {
        setSource(prev)
        setChosen(previouslyChosen)
        setNotice({ kind: 'error', text: 'Could not save your choice. Check your internet connection and try again.' })
      } finally {
        setBusy(null)
      }
    })
  }

  function internalTest() {
    setNotice(null)
    setBusy('test')
    startTransition(async () => {
      try {
        const res = await sendTestWebhook(campaign.id)
        if (res?.error) setNotice({ kind: 'error', text: res.error })
        else {
          setNotice({ kind: 'ok', text: 'Our side is working: a "Test Lead" was added. This does not check your real form. Submit your form to finish.' })
          router.refresh()
        }
      } catch {
        setNotice({ kind: 'error', text: 'The internal test could not be sent. Check your internet connection and try again.' })
      } finally {
        setBusy(null)
      }
    })
  }

  const handoff = () => copy('handoff', buildHandoffText({ campaign, offerLine, webhookUrl, source }))

  // ----- Collapsed banner -----
  const header = received ? (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="panel-connected">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-semibold text-foreground">Your lead form is connected</p>
          <p className="text-sm text-muted-foreground" data-testid="text-last-received">
            Last form submission received {timeAgo(received, nowMs)}. This shows the most recent delivery, not a live check that the connection is still working.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-2" onClick={() => setOpen((v) => !v)} data-testid="button-toggle-setup">
          {open ? 'Hide setup steps' : 'Setup steps'}
        </Button>
        <Button variant="outline" className="gap-2" onClick={onOpenSettings} data-testid="button-connection-settings">
          <Settings2 className="size-4" />
          Connection settings
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="panel-not-connected">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div>
          <p className="font-semibold text-foreground">Finish connecting your lead form</p>
          <p className="text-sm text-muted-foreground">
            Your offer is saved. New ad leads will not arrive here until your form is connected.
          </p>
        </div>
      </div>
      {!open ? (
        <Button onClick={() => setOpen(true)} data-testid="button-continue-setup">Continue setup</Button>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(false)} data-testid="button-do-later">Do this later</Button>
      )}
    </div>
  )

  const quickActions = (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3" data-testid="panel-quick-actions">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => copy('url', webhookUrl)} data-testid="button-copy-connect-url-header">
        {copied === 'url' ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied === 'url' ? 'Copied' : 'Copy connection link'}
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={handoff} data-testid="button-handoff-header">
        {copied === 'handoff' ? <Check className="size-4" /> : <UserPlus className="size-4" />}
        {copied === 'handoff' ? 'Copied. Paste into a message' : 'Have someone else finish this'}
      </Button>
      <span className="text-xs text-muted-foreground">Private link: share only with people you trust.</span>
    </div>
  )

  return (
    <section
      className={cn('mt-6 min-w-0 rounded-lg border p-4 sm:p-5', received ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/60')}
      aria-label="Lead form connection"
      data-testid="connect-leads-panel"
    >
      {header}
      {quickActions}

      {open ? (
        <div className="mt-5 min-w-0 space-y-6 rounded-md border border-border bg-card p-4 sm:p-5">
          {notice ? (
            <p role="status" className={cn('rounded-md border px-3 py-2 text-sm', notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900')} data-testid="text-connect-notice">
              {notice.text}
            </p>
          ) : null}

          {/* Step 1: where */}
          <div>
            <h2 className="text-base font-semibold text-foreground">1. Where do people fill out the form?</h2>
            <p className="text-sm text-muted-foreground">Not where the ad runs, but where they type their name and phone.</p>
            <div role="radiogroup" aria-label="Where people fill out the form" className="mt-3 grid gap-2 sm:grid-cols-2">
              {SOURCE_OPTIONS.map((o) => {
                const sel = chosen && source === o.id
                return (
                  <label key={o.id} className={cn('flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors', sel ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="lead-source" value={o.id} checked={sel} onChange={() => choose(o.id)} disabled={pending} className="accent-primary" data-testid={`radio-source-${o.id}`} />
                      <span className="text-sm font-medium text-foreground">{o.label}</span>
                      {busy === 'source' && source === o.id ? <Loader2 className="size-3 animate-spin" /> : null}
                    </span>
                    <span className="pl-6 text-xs text-muted-foreground">{o.hint}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {chosen ? (
            <>
              {/* Step 2: instructions */}
              <div data-testid={`instructions-${source}`}>
                <h2 className="text-base font-semibold text-foreground">2. Connect it</h2>
                <div className="mt-3">
                  <p className="text-sm font-medium text-foreground">Your private connection address</p>
                  <p className="text-xs text-muted-foreground">Anyone with it can add leads. Only share it with people you trust, never on a public page.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="block w-full min-w-0 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs sm:w-auto sm:flex-1" title={webhookUrl} data-testid="text-connect-url">{webhookUrl}</code>
                    <Button variant="outline" className="gap-2" onClick={() => copy('url', webhookUrl)} data-testid="button-copy-connect-url">
                      {copied === 'url' ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied === 'url' ? 'Copied' : 'Copy address'}
                    </Button>
                  </div>
                </div>

                {source === 'ghl' ? (
                  <div className="-mx-4 mt-4 min-w-0 border-t border-border sm:-mx-5">
                    <GhlGuide webhookUrl={webhookUrl} campaignName={campaign.name} copy={(t) => copy('url', t)} copied={copied === 'url'} />
                  </div>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {stepsFor(source).map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                        <span className="text-foreground">{s}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {source === 'facebook' ? (
                  <a href={ZAPIER_FB_LINK} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Zapier's Facebook Lead Ads to Webhook guide <ExternalLink className="size-3.5" />
                  </a>
                ) : null}

                {source !== 'ghl' ? (
                  <div className="mt-4 overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr><th className="px-3 py-2 font-medium">Send as</th><th className="px-3 py-2 font-medium">What it is</th><th className="px-3 py-2 font-medium">Needed?</th></tr>
                      </thead>
                      <tbody>
                        {FIELDS.map(([k, l, r]) => (
                          <tr key={k} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs">{k}</td>
                            <td className="px-3 py-2">{l}</td>
                            <td className="px-3 py-2">{r ? <span className="font-medium text-foreground">Required</span> : <span className="text-muted-foreground">Optional</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {/* Step 3: test */}
              <div>
                <h2 className="text-base font-semibold text-foreground">3. Test with your real form</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open your actual ad form (or website form) and submit it once with your own name and phone. This page checks for it automatically.
                </p>
                <div className="mt-3 rounded-md border border-border px-4 py-3 text-sm" role="status" data-testid="text-receipt-status">
                  {received ? (
                    <span className="flex items-center gap-2 text-emerald-900"><CheckCircle2 className="size-4" /> Form submission received {timeAgo(received, nowMs)}. Your form reached us. (This is the latest delivery, not ongoing monitoring.)</span>
                  ) : (
                    <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Waiting for a submission from your form. Nothing received yet.</span>
                  )}
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Only want to check our side?</summary>
                  <p className="mt-2 text-muted-foreground">
                    This adds a "Test Lead" from inside Reactivation Power. It confirms our address works, but it does <b>not</b> prove your form is connected.
                    {internal ? ` Last internal test ${timeAgo(internal, nowMs)}.` : ''}
                  </p>
                  <Button variant="outline" size="sm" className="mt-2 gap-2" disabled={pending || archived} onClick={internalTest} data-testid="button-internal-test">
                    {busy === 'test' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Send internal test
                  </Button>
                </details>
              </div>
            </>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" className="gap-2" onClick={handoff} data-testid="button-handoff">
              {copied === 'handoff' ? <Check className="size-4" /> : <UserPlus className="size-4" />}
              {copied === 'handoff' ? 'Copied. Paste into a message' : 'Have someone else finish this'}
            </Button>
            <Button variant="ghost" className="gap-2" onClick={onOpenSettings} data-testid="button-advanced-settings">
              <Settings2 className="size-4" />
              Advanced settings
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The copied instructions include your private address. Only send them to someone you trust, like your ad manager or web person.
          </p>
        </div>
      ) : null}
    </section>
  )
}
