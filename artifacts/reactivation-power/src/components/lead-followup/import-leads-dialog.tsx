// @ts-nocheck

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'
import { importLeads } from '@/app/actions/lead-followup'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ImportProgress } from '@/components/portal/import-progress'
import {
  detectColumnsWith,
  dropRedundantFullName,
  NAME_LOOSE_PATTERNS,
  NAME_STRICT_PATTERNS,
  parseCsv,
  type HeaderPatterns,
} from '@/lib/csv-import'
import { cn } from '@/lib/utils'
import { useRouter } from '@/hooks/use-router'

/**
 * CSV upload into ONE campaign. Same upload → match-your-columns → progress
 * flow as the contacts import; the columns are what an ad form collects
 * (name, phone, e-mail, requested time, what they wrote) instead of patient
 * history. Dedupe is per campaign and happens on the server.
 */

type Target = 'name' | 'firstName' | 'lastName' | 'phone' | 'email' | 'requestedTime' | 'message'

const TARGET_LABELS: Record<Target, string> = {
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  email: 'Email',
  requestedTime: 'Requested day / time',
  message: 'What they wrote',
}

const MAPPING_ORDER: Target[] = ['firstName', 'lastName', 'name', 'phone', 'email', 'requestedTime', 'message']

const STRICT_PATTERNS: HeaderPatterns<Target> = [
  ...NAME_STRICT_PATTERNS,
  ['phone', /^(mobile|cell)[\s_-]?(phone|number|no|#)?$|^(phone|phone[\s_-]?number|primary|preferred)[\s_-]?(mobile|cell)?$/i],
  ['email', /^(e-?mail|email[\s_-]?address|e-?mail[\s_-]?1)$/i],
  [
    'requestedTime',
    /^(requested|preferred|desired)[\s_-]?(day|time|date|appointment|appt|slot)([\s_-]?(and|\/|&)?[\s_-]?time)?$|^(best|good)[\s_-]?time([\s_-]?to[\s_-]?call)?$|^(appointment|appt)[\s_-]?(time|date|request)$|^when$/i,
  ],
  ['message', /^(message|comments?|notes?|question|details|what[\s_-]?they[\s_-]?wrote|tell[\s_-]?us[\s_-]?more|form[\s_-]?message)$/i],
]

const LOOSE_PATTERNS: HeaderPatterns<Target> = [
  ['phone', /(phone|mobile|cell|tel\b|contact[\s_-]?number)/i],
  ['email', /e-?mail/i],
  ...NAME_LOOSE_PATTERNS,
  ['requestedTime', /(requested|preferred|desired|best)[\s_-]?(day|time|date|appt|appointment)|appointment|schedule/i],
  ['message', /(message|comment|note|question|detail|concern|wrote)/i],
]

function detectColumns(headers: string[]): Partial<Record<Target, number>> {
  const map = detectColumnsWith(headers, STRICT_PATTERNS, LOOSE_PATTERNS)
  dropRedundantFullName(map)
  return map
}

type Step = 'upload' | 'columns' | 'importing' | 'done'
const NONE = '__none__'
const SAMPLE_COUNT = 3

interface ImportResult {
  imported: number
  skippedDuplicate: number
  skippedInvalid: number
}

export function ImportLeadsDialog({
  campaignId,
  campaignName,
  disabled,
}: {
  campaignId: string
  campaignName: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [hasHeaders, setHasHeaders] = useState(true)
  const [columns, setColumns] = useState<Partial<Record<Target, number>>>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importDone, setImportDone] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const headers = useMemo(() => {
    const first = rows[0] ?? []
    return hasHeaders ? first.map((h, i) => h.trim() || `Column ${i + 1}`) : first.map((_, i) => `Column ${i + 1}`)
  }, [rows, hasHeaders])
  const dataRows = useMemo(() => (hasHeaders ? rows.slice(1) : rows), [rows, hasHeaders])

  function reset() {
    setStep('upload')
    setFileName(null)
    setPasted('')
    setRows([])
    setHasHeaders(true)
    setColumns({})
    setError(null)
    setResult(null)
    setImportDone(false)
  }

  function loadText(text: string, name: string | null) {
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      setError('That file looks empty. Export your lead list as a CSV and try again.')
      return
    }
    const detected = detectColumns(parsed[0] ?? [])
    const looksLikeHeaders = Object.keys(detected).length > 0
    if (looksLikeHeaders && parsed.length < 2) {
      setError('That file has column headings but no leads under them. Check the export included the rows, then try again.')
      return
    }
    setError(null)
    setFileName(name)
    setRows(parsed)
    setHasHeaders(looksLikeHeaders)
    setColumns(looksLikeHeaders ? detected : {})
    setStep('columns')
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    loadText(await file.text(), file.name)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const isCsv =
      /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'text/plain' || file.type === ''
    if (!isCsv) {
      setError('That does not look like a CSV file. Please drop a .csv export.')
      return
    }
    void handleFile(file)
  }

  const nameMapped = columns.name !== undefined || columns.firstName !== undefined
  const canImport = nameMapped && columns.phone !== undefined && dataRows.length > 0

  function cell(r: string[], target: Target): string | undefined {
    const idx = columns[target]
    return idx === undefined ? undefined : (r[idx] ?? '').trim()
  }

  function runImport() {
    setError(null)
    setImportDone(false)
    setStep('importing')
    const startedAt = Date.now()
    startTransition(async () => {
      const res = await importLeads({
        campaignId,
        rows: dataRows.map((r) => ({
          firstName: cell(r, 'firstName'),
          lastName: cell(r, 'lastName'),
          name: cell(r, 'name'),
          phone: cell(r, 'phone') ?? '',
          email: cell(r, 'email'),
          requestedTime: cell(r, 'requestedTime'),
          message: cell(r, 'message'),
        })),
      })
      if (res?.error) {
        setError(res.error)
        setStep('columns')
        return
      }
      const elapsed = Date.now() - startedAt
      if (elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed))
      setImportDone(true)
      await new Promise((r) => setTimeout(r, 450))
      setResult({
        imported: res.imported ?? 0,
        skippedDuplicate: res.skippedDuplicate ?? 0,
        skippedInvalid: res.skippedInvalid ?? 0,
      })
      setStep('done')
      router.refresh()
    })
  }

  function sampleValues(colIndex: number | undefined): string[] {
    if (colIndex === undefined) return []
    const out: string[] = []
    for (const r of dataRows) {
      const v = (r[colIndex] ?? '').trim()
      if (v && !out.includes(v)) out.push(v)
      if (out.length >= SAMPLE_COUNT) break
    }
    return out
  }

  const columnItems = [
    { value: NONE, label: 'Not in this file' },
    ...headers.map((h, i) => ({ value: String(i), label: h })),
  ]

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2" disabled={disabled} data-testid="button-upload-leads">
        <Upload className="size-4" />
        Upload Leads
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {step === 'upload' && (
            <>
              <DialogHeader>
                <DialogTitle>Upload leads to {campaignName}</DialogTitle>
                <DialogDescription>
                  A CSV export from your ad platform or form tool. Leads go into this campaign only; a phone number
                  already in it is skipped.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
                  onDrop={handleDrop}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                    dragActive ? 'border-accent bg-accent/10' : 'border-border bg-muted/40 hover:border-accent hover:bg-accent/5',
                  )}
                >
                  <FileSpreadsheet className={cn('size-8', dragActive ? 'text-accent' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium text-foreground">
                    {dragActive ? 'Drop your CSV file here' : 'Drag & drop a CSV file, or click to choose'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Columns for name and phone; e-mail, requested time and their message are optional
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="sr-only"
                  aria-label="Upload CSV file"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Not sure how to format the list? Start from the sample file — columns are pre-named so they match
                    automatically.
                  </p>
                  <a
                    href="/api/templates/leads"
                    download
                    className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="size-3.5" />
                    Sample lead list
                  </a>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Or paste rows from a spreadsheet</p>
                  <Textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    rows={4}
                    placeholder={'First Name,Last Name,Phone,Email,Requested Time,Message\nJane,Smith,(555) 555-0100,jane@example.com,Tuesday after 3pm,Back pain for two weeks'}
                    className="font-mono text-xs"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={!pasted.trim()} onClick={() => loadText(pasted, null)}>
                      Use pasted data
                    </Button>
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </>
          )}

          {step === 'columns' && (
            <>
              <DialogHeader>
                <DialogTitle>Match your columns</DialogTitle>
                <DialogDescription>
                  {fileName ? `${fileName} — ` : ''}
                  <span className="font-semibold text-foreground">
                    {dataRows.length} lead{dataRows.length === 1 ? '' : 's'} detected.
                  </span>{' '}
                  We matched what we could — check the sample values on each row to confirm the right column is picked.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={hasHeaders}
                    onChange={(e) => setHasHeaders(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  First row is column headings
                </label>
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Your column</span>
                    <span>Goes into</span>
                    <span>Sample values</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {MAPPING_ORDER.map((target) => {
                      const idx = columns[target]
                      const samples = sampleValues(idx)
                      const required =
                        target === 'phone' ||
                        (target === 'name' && columns.firstName === undefined) ||
                        (target === 'firstName' && columns.name === undefined)
                      return (
                        <li
                          key={target}
                          className={cn(
                            'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3 px-3 py-2',
                            idx === undefined ? 'bg-background' : 'bg-card',
                          )}
                        >
                          <Select
                            value={idx !== undefined ? String(idx) : NONE}
                            onValueChange={(v) => {
                              if (!v) return
                              setColumns((prev) => {
                                const next = { ...prev }
                                if (v === NONE) delete next[target]
                                else next[target] = Number(v)
                                return next
                              })
                            }}
                            items={columnItems}
                          >
                            <SelectTrigger
                              className={cn('h-9 min-w-0', idx === undefined && 'text-muted-foreground')}
                              aria-label={`Your column for ${TARGET_LABELS[target]}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {columnItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-sm text-foreground">
                            {TARGET_LABELS[target]}
                            {required && idx === undefined ? <span className="ml-1 text-destructive">*</span> : null}
                          </span>
                          <span className="truncate text-xs text-muted-foreground" title={samples.join(' · ')}>
                            {samples.length > 0 ? samples.join(' · ') : '—'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
                {!canImport && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="size-4" />
                    Pick a column for the name (full name, or first name) and one for the phone number.
                  </p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex items-center justify-between pt-2">
                  <Button variant="ghost" onClick={reset} className="gap-2">
                    <ArrowLeft className="size-4" />
                    Choose a different file
                  </Button>
                  <Button onClick={runImport} disabled={!canImport} data-testid="button-import-leads">
                    Add {dataRows.length} lead{dataRows.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'importing' && (
            <>
              <DialogHeader>
                <DialogTitle>Adding leads…</DialogTitle>
                <DialogDescription>Checking each phone number against this campaign.</DialogDescription>
              </DialogHeader>
              <ImportProgress total={dataRows.length} done={importDone} label="Leads added" />
            </>
          )}

          {step === 'done' && result && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  Upload complete
                </DialogTitle>
                <DialogDescription>
                  {result.imported} lead{result.imported === 1 ? '' : 's'} added to {campaignName}.
                </DialogDescription>
              </DialogHeader>
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                <li data-testid="text-imported">
                  <span className="font-semibold text-foreground">{result.imported}</span> added
                </li>
                <li data-testid="text-skipped-duplicate">
                  <span className="font-semibold text-foreground">{result.skippedDuplicate}</span> skipped — phone
                  already in this campaign
                </li>
                <li data-testid="text-skipped-invalid">
                  <span className="font-semibold text-foreground">{result.skippedInvalid}</span> skipped — missing a
                  name or usable phone
                </li>
              </ul>
              <div className="flex justify-end pt-2">
                <Button onClick={() => { setOpen(false); reset() }}>Done</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
