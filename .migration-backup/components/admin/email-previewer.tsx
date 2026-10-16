'use client'

import { useState } from 'react'
import { Check, Copy, Download, Monitor, Smartphone } from 'lucide-react'
import {
  EMAIL_ASSET_BASE,
  EMAIL_AUDIENCES,
  templatesForAudience,
  type EmailAudienceId,
} from '@/lib/email-templates'
import { notifyDone, notifyError } from '@/lib/notify'
import { cn } from '@/lib/utils'

/**
 * Display-only: point graphics at this deployment's own /images/emails so a
 * freshly generated one previews before the production site is republished.
 * The copied and exported HTML keeps the production URLs untouched.
 */
function previewHtml(html: string) {
  return html.split(EMAIL_ASSET_BASE).join('/images/emails')
}

export function EmailPreviewer() {
  const [audienceId, setAudienceId] = useState<EmailAudienceId>(
    EMAIL_AUDIENCES[0].id,
  )
  const [selectedId, setSelectedId] = useState<string>(
    templatesForAudience(EMAIL_AUDIENCES[0].id)[0]?.id ?? '',
  )
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [copied, setCopied] = useState(false)

  const audience =
    EMAIL_AUDIENCES.find((a) => a.id === audienceId) ?? EMAIL_AUDIENCES[0]
  const templates = templatesForAudience(audience.id)
  const template =
    templates.find((t) => t.id === selectedId) ?? templates[0] ?? null

  function selectAudience(id: EmailAudienceId) {
    setAudienceId(id)
    setSelectedId(templatesForAudience(id)[0]?.id ?? '')
    setCopied(false)
  }

  async function copyCode() {
    if (!template) return
    try {
      await navigator.clipboard.writeText(template.html)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      notifyDone('Email HTML copied', template.name)
    } catch {
      notifyError('Could not copy the HTML')
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Audience switcher */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              Written for
            </span>
            <div className="flex rounded-md border border-input">
              {EMAIL_AUDIENCES.map((a) => {
                const active = a.id === audience.id
                const count = templatesForAudience(a.id).length
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => selectAudience(a.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-[5px] last:rounded-r-[5px]',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {a.name}
                    <span
                      className={cn(
                        'rounded-full px-1.5 font-mono text-xs leading-5',
                        active
                          ? 'bg-primary-foreground/15 text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          {/* components/ui/button.tsx has no asChild — a styled anchor keeps
              this a real download link the browser handles natively. */}
          <a
            href={`/api/admin/emails/export?audience=${audience.id}`}
            download
            className="flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <Download className="size-4" />
            Download the {audience.name} set (.zip)
          </a>
        </div>
        <p className="border-t border-border px-4 py-2 text-xs leading-5 text-muted-foreground">
          {audience.description}
        </p>
      </div>

      {/* Template picker */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {audience.name} sequence
          </span>
          <span className="text-xs text-muted-foreground">
            {templates.length} ready to send
          </span>
        </div>
        <div className="max-h-52 overflow-y-auto p-2">
          {templates.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No emails written for this audience yet.
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {templates.map((t, i) => {
                const active = template?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(t.id)
                      setCopied(false)
                    }}
                    aria-pressed={active}
                    className={cn(
                      'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-transparent text-foreground hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 font-mono text-xs leading-5',
                        active
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground',
                      )}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-medium leading-5">
                      {t.name.replace(/^Email \d+ — /, '')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {template && (
        <>
          {/* Meta */}
          <div className="rounded-lg border border-border bg-card p-4">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">
                  Subject
                </dt>
                <dd className="text-foreground">{template.subject}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">
                  Preview text
                </dt>
                <dd className="text-foreground">{template.previewText}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">
                  Angle
                </dt>
                <dd className="text-muted-foreground">{template.angle}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">
                  Placeholders
                </dt>
                <dd className="text-muted-foreground">
                  None to swap — the Schedule a Call button links to{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    reactivationpower.com/healthcare
                  </code>{' '}
                  (the landing page, where the intake form flows into the
                  booking calendar).{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {'{{contact.first_name}}'}
                  </code>{' '}
                  is a GHL merge tag and works as-is.
                </dd>
              </div>
            </dl>
          </div>

          {/* Code + live preview */}
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
            {/* Code panel */}
            <div className="flex min-h-[400px] flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  HTML for GoHighLevel
                </span>
                <button
                  type="button"
                  onClick={copyCode}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    copied
                      ? 'bg-success/10 text-success'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="size-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      Copy Code
                    </>
                  )}
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-4 text-xs leading-relaxed text-muted-foreground">
                <code>{template.html}</code>
              </pre>
            </div>

            {/* Live preview panel */}
            <div className="flex min-h-[400px] flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  Live Preview
                </span>
                <div className="flex rounded-md border border-input">
                  <button
                    type="button"
                    onClick={() => setDevice('desktop')}
                    aria-pressed={device === 'desktop'}
                    className={cn(
                      'flex items-center gap-1.5 rounded-l-[5px] px-3 py-1.5 text-sm font-medium transition-colors',
                      device === 'desktop'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
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
                      device === 'mobile'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
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
                  srcDoc={previewHtml(template.html)}
                  sandbox=""
                  className={cn(
                    'h-full rounded-md border border-border bg-background shadow-sm transition-all',
                    device === 'desktop' ? 'w-full' : 'w-[375px] shrink-0',
                  )}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
