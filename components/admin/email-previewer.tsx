'use client'

import { useState } from 'react'
import { Check, Copy, Monitor, Smartphone } from 'lucide-react'
import { EMAIL_TEMPLATES } from '@/lib/email-templates'
import { notifyDone, notifyError } from '@/lib/notify'
import { cn } from '@/lib/utils'

export function EmailPreviewer() {
  const [selectedId, setSelectedId] = useState(EMAIL_TEMPLATES[0].id)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [copied, setCopied] = useState(false)

  const template =
    EMAIL_TEMPLATES.find((t) => t.id === selectedId) ?? EMAIL_TEMPLATES[0]

  async function copyCode() {
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
      {/* Template picker */}
      <div className="flex flex-wrap gap-2">
        {EMAIL_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSelectedId(t.id)
              setCopied(false)
            }}
            className={cn(
              'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
              t.id === selectedId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

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
              (the landing page, where the intake form flows into the booking
              calendar).{' '}
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
              srcDoc={template.html}
              sandbox=""
              className={cn(
                'h-full rounded-md border border-border bg-background shadow-sm transition-all',
                device === 'desktop' ? 'w-full' : 'w-[375px] shrink-0',
              )}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
