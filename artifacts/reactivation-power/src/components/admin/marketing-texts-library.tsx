import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import type { MarketingText } from '@workspace/shared/marketing-texts'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { notifyDone, notifyError } from '@/lib/notify'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function marketingTextsExportUrl() {
  return `${import.meta.env.BASE_URL}api/admin/marketing-texts/export`
}

export function MarketingTextsLibrary() {
  const { data, loading, error } = usePageData<{ texts: MarketingText[]; instructions: string }>(
    '/admin/marketing-texts',
  )
  const [selected, setSelected] = useState(1)
  const [copied, setCopied] = useState(false)

  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const texts = data?.texts ?? []
  const text = texts.find((t) => t.number === selected) ?? texts[0] ?? null

  async function copy() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      notifyDone('Text copied', text.title)
    } catch {
      setCopied(false)
      notifyError('Could not copy the text')
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Marketing Texts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {texts.length} provider messages, written in order. Copy one at a time.
          </p>
        </div>
        <a
          href={marketingTextsExportUrl()}
          download
          data-testid="link-download-texts"
          className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0 gap-2')}
        >
          <Download className="size-4" />
          Download all texts (.zip)
        </a>
      </header>
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Nothing here sends or schedules a message. Share the ZIP with your assistant
        to load externally. Replace Dr. [Last Name] before sending. Numbers show
        sequence order, not sending dates; external imports do not update automatically.
      </p>
      <details className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Loading instructions and verified tracking-link details
        </summary>
        <div className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
          {data?.instructions}
        </div>
      </details>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[560px] overflow-y-auto rounded-lg border border-border bg-card p-2">
          {texts.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No texts available.</p>
          ) : (
            <ol className="flex flex-col gap-1">
              {texts.map((t) => {
                const active = text?.number === t.number
                return (
                  <li key={t.number}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSelected(t.number)
                        setCopied(false)
                      }}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-transparent text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="shrink-0 font-mono text-xs leading-5 opacity-70">
                        {String(t.number).padStart(2, '0')}
                      </span>
                      <span className="text-sm font-medium leading-5">{t.title}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
        {text && (
          <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">
                {text.number}. {text.title}
              </span>
              <button
                type="button"
                onClick={copy}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  copied
                    ? 'bg-success/10 text-success'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy Text'}
              </button>
            </div>
            <div
              data-testid="text-preview"
              className="whitespace-pre-wrap p-4 text-sm leading-relaxed text-foreground"
            >
              {text.body}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
