'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react'
import { importContacts } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  normalizeServiceLabel,
  suggestNicheForService,
} from '@/lib/niche-match'
import type { Niche, ServiceNicheMapping } from '@/lib/types'

// ---------- tiny CSV parser (handles quoted fields, CRLF) ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

// ---------- column auto-detection ----------

type Target =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'email'
  | 'service'
  | 'complaint'
  | 'notes'

const TARGET_LABELS: Record<Target, string> = {
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  email: 'Email',
  service: 'Service / appointment type',
  complaint: 'Previously treated for',
  notes: 'Notes',
}

const HEADER_PATTERNS: Array<[Target, RegExp]> = [
  ['firstName', /^(first[\s_-]?name|fname|first)$/i],
  ['lastName', /^(last[\s_-]?name|lname|last|surname)$/i],
  ['name', /^(full[\s_-]?name|name|patient[\s_-]?name|client[\s_-]?name|contact)$/i],
  ['phone', /(phone|mobile|cell|tel)/i],
  ['email', /e-?mail/i],
  [
    'service',
    /(service|appointment[\s_-]?type|appt[\s_-]?type|treatment|procedure|visit[\s_-]?type|product|package|program|last[\s_-]?service)/i,
  ],
  [
    'complaint',
    /(complaint|condition|treated[\s_-]?for|diagnosis|concern)/i,
  ],
  ['notes', /(note|comment|memo)/i],
]

function detectColumns(headers: string[]): Partial<Record<Target, number>> {
  const map: Partial<Record<Target, number>> = {}
  headers.forEach((h, idx) => {
    const header = h.trim()
    for (const [target, pattern] of HEADER_PATTERNS) {
      if (map[target] === undefined && pattern.test(header)) {
        map[target] = idx
        return
      }
    }
  })
  return map
}

// ---------- component ----------

type Step = 'upload' | 'columns' | 'services' | 'done'

const NONE = '__none__'
const DEFAULT = '__default__'
const AUTO = '__auto__'

interface Props {
  niches: Niche[]
  savedMappings: ServiceNicheMapping[]
  defaultNicheName: string | null
}

export function ImportContactsDialog({
  niches,
  savedMappings,
  defaultNicheName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [hasHeaders, setHasHeaders] = useState(true)
  const [columns, setColumns] = useState<Partial<Record<Target, number>>>({})
  const [fileNiche, setFileNiche] = useState<string>(AUTO)
  const [serviceMap, setServiceMap] = useState<Record<string, string>>({})
  const [autoMatched, setAutoMatched] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    imported: number
    skippedDuplicate: number
    skippedInvalid: number
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const headers = useMemo(
    () =>
      hasHeaders
        ? (rows[0] ?? []).map((h, i) => h.trim() || `Column ${i + 1}`)
        : (rows[0] ?? []).map((_, i) => `Column ${i + 1}`),
    [rows, hasHeaders],
  )
  const dataRows = useMemo(
    () => (hasHeaders ? rows.slice(1) : rows),
    [rows, hasHeaders],
  )

  const nicheById = useMemo(
    () => new Map(niches.map((n) => [n.id, n])),
    [niches],
  )

  // Unique service labels with counts, from the mapped service column
  const uniqueServices = useMemo(() => {
    const idx = columns.service
    if (idx === undefined) return []
    const counts = new Map<string, { label: string; count: number }>()
    for (const r of dataRows) {
      const raw = (r[idx] ?? '').trim()
      if (!raw) continue
      const key = normalizeServiceLabel(raw)
      const entry = counts.get(key)
      if (entry) entry.count++
      else counts.set(key, { label: raw, count: 1 })
    }
    return Array.from(counts.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [dataRows, columns.service])

  function reset() {
    setStep('upload')
    setFileName(null)
    setPasted('')
    setRows([])
    setHasHeaders(true)
    setColumns({})
    setFileNiche(AUTO)
    setServiceMap({})
    setError(null)
    setResult(null)
  }

  function loadText(text: string, name: string | null) {
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      setError('That file looks empty. Export your patient list as a CSV and try again.')
      return
    }
    setError(null)
    setFileName(name)
    setRows(parsed)
    const detected = detectColumns(parsed[0] ?? [])
    const looksLikeHeaders = Object.keys(detected).length > 0
    setHasHeaders(looksLikeHeaders)
    setColumns(looksLikeHeaders ? detected : {})
    setStep('columns')
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    loadText(text, file.name)
  }

  function goToServices() {
    const hasName =
      columns.name !== undefined || columns.firstName !== undefined
    if (!hasName || columns.phone === undefined) {
      setError('Map at least a name column and a phone column to continue.')
      return
    }
    setError(null)

    if (fileNiche !== AUTO) {
      // Whole file tagged with one niche: no per-service mapping needed
      setServiceMap({})
      void runImport({})
      return
    }

    if (columns.service === undefined || uniqueServices.length === 0) {
      // No service column: everything falls to the practice default
      setServiceMap({})
      void runImport({})
      return
    }

    // Prefill: saved mapping -> keyword suggestion -> default
    const saved = new Map(
      savedMappings.map((m) => [m.service_label, m.niche_id]),
    )
    const map: Record<string, string> = {}
    let matched = 0
    for (const s of uniqueServices) {
      const savedNiche = saved.get(s.key)
      if (savedNiche && nicheById.has(savedNiche)) {
        map[s.key] = savedNiche
        matched++
        continue
      }
      const suggestion = suggestNicheForService(s.label, niches)
      if (suggestion) {
        map[s.key] = suggestion.id
        matched++
      } else {
        map[s.key] = DEFAULT
      }
    }
    setServiceMap(map)
    setAutoMatched(matched)
    setStep('services')
  }

  function buildRows() {
    return dataRows.map((r) => {
      const first =
        columns.firstName !== undefined ? (r[columns.firstName] ?? '').trim() : ''
      const last =
        columns.lastName !== undefined ? (r[columns.lastName] ?? '').trim() : ''
      const full =
        columns.name !== undefined ? (r[columns.name] ?? '').trim() : ''
      const name = full || [first, last].filter(Boolean).join(' ')
      return {
        name,
        phone: columns.phone !== undefined ? (r[columns.phone] ?? '').trim() : '',
        email: columns.email !== undefined ? (r[columns.email] ?? '').trim() : '',
        service:
          columns.service !== undefined ? (r[columns.service] ?? '').trim() : '',
        complaint:
          columns.complaint !== undefined
            ? (r[columns.complaint] ?? '').trim()
            : '',
        notes: columns.notes !== undefined ? (r[columns.notes] ?? '').trim() : '',
      }
    })
  }

  function runImport(map: Record<string, string>) {
    setError(null)
    startTransition(async () => {
      const mappings = Object.entries(map)
        .filter(([, v]) => v !== DEFAULT)
        .map(([service_label, v]) => ({
          service_label,
          niche_id: v === NONE ? null : v,
        }))
      const res = await importContacts({
        rows: buildRows(),
        mappings,
        forceNicheId: fileNiche !== AUTO ? fileNiche : null,
      })
      if (res?.error) {
        setError(res.error)
        return
      }
      setResult({
        imported: res.imported ?? 0,
        skippedDuplicate: res.skippedDuplicate ?? 0,
        skippedInvalid: res.skippedInvalid ?? 0,
      })
      setStep('done')
    })
  }

  const columnItems = [
    { value: NONE, label: 'Not in this file' },
    ...headers.map((h, i) => ({ value: String(i), label: h })),
  ]

  const nicheItems = [
    {
      value: DEFAULT,
      label: defaultNicheName
        ? `Account default (${defaultNicheName})`
        : 'Account default (none set)',
    },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]

  const fileNicheItems = [
    { value: AUTO, label: 'Auto-match from service column' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Upload className="size-4" />
        Import CSV
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
                <DialogTitle>Import contacts from a CSV</DialogTitle>
                <DialogDescription>
                  Export your patient or customer list from your management
                  software and upload it here. If the export includes a
                  service or appointment-type column, contacts are matched to
                  the right niche automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <FileSpreadsheet className="size-8 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    Click to choose a CSV file
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Include columns for name, phone, and (ideally) the service
                    or appointment type
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
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Not sure how to format your list? Start from our template —
                    the columns are pre-named so they match automatically.
                  </p>
                  <Button asChild size="sm" variant="outline" className="shrink-0 bg-transparent">
                    <a href="/templates/contact-import-template.csv" download="contact-import-template.csv">
                      <Download className="size-3.5" />
                      CSV template
                    </a>
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="csv-paste">Or paste CSV data</Label>
                  <Textarea
                    id="csv-paste"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    rows={4}
                    placeholder={'Name,Phone,Last Service\nJane Smith,(555) 201-4433,Botox 50u'}
                    className="font-mono text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!pasted.trim()}
                      onClick={() => loadText(pasted, null)}
                    >
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
                  {dataRows.length} row{dataRows.length === 1 ? '' : 's'} found.
                  We matched what we could — confirm which column is which.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <Label htmlFor="file-niche" className="text-xs">
                    Niche for this file
                  </Label>
                  <Select
                    value={fileNiche}
                    onValueChange={(v) => {
                      if (v) setFileNiche(v)
                    }}
                    items={fileNicheItems}
                  >
                    <SelectTrigger id="file-niche" className="h-9" aria-label="Niche for this file">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fileNicheItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {fileNiche === AUTO
                      ? 'Contacts are matched by their service column, falling back to your account default. Or pick a niche to tag every contact in this file with it.'
                      : `Every contact in this file will be tagged ${nicheById.get(fileNiche)?.name ?? 'the selected niche'} and get that script when called.`}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={hasHeaders}
                    onChange={(e) => setHasHeaders(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  First row is column headings
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    ['name', 'firstName', 'lastName', 'phone', 'email', 'service', 'complaint', 'notes'] as Target[]
                  ).map((target) => (
                    <div key={target} className="flex flex-col gap-1.5">
                      <Label className="text-xs">
                        {TARGET_LABELS[target]}
                        {target === 'phone' && ' *'}
                        {target === 'service' && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            (drives niche matching)
                          </span>
                        )}
                      </Label>
                      <Select
                        value={
                          columns[target] !== undefined
                            ? String(columns[target])
                            : NONE
                        }
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
                          className="h-9"
                          aria-label={TARGET_LABELS[target]}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {columnItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {columns.service === undefined && fileNiche === AUTO && (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    No service column selected — every imported contact will
                    use your account default niche
                    {defaultNicheName ? ` (${defaultNicheName})` : ''}. If your
                    software can export the appointment or service type,
                    including it lets each contact get the right script
                    automatically. Or pick a niche for this file above.
                  </p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" className="gap-2" onClick={reset}>
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={pending}
                    onClick={goToServices}
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {fileNiche !== AUTO || columns.service === undefined
                      ? `Import ${dataRows.length} contact${dataRows.length === 1 ? '' : 's'}`
                      : 'Continue'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'services' && (
            <>
              <DialogHeader>
                <DialogTitle>Assign services to niches</DialogTitle>
                <DialogDescription>
                  We found {uniqueServices.length} service type
                  {uniqueServices.length === 1 ? '' : 's'} across{' '}
                  {dataRows.length} contacts
                  {autoMatched > 0 &&
                    ` and matched ${autoMatched} automatically`}
                  . Assign the rest — this is remembered for future uploads.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {autoMatched > 0 && (
                  <p className="flex items-center gap-2 rounded-md bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
                    <Sparkles className="size-3.5 shrink-0" />
                    {autoMatched} of {uniqueServices.length} matched
                    automatically — review and adjust anything we got wrong.
                  </p>
                )}
                <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                  {uniqueServices.map((s) => (
                    <li
                      key={s.key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {s.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.count} contact{s.count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Select
                        value={serviceMap[s.key] ?? DEFAULT}
                        onValueChange={(v) => {
                          if (!v) return
                          setServiceMap((prev) => ({ ...prev, [s.key]: v }))
                        }}
                        items={nicheItems}
                      >
                        <SelectTrigger
                          className="h-9 w-56"
                          aria-label={`Niche for ${s.label}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {nicheItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-between gap-2">
                  <Button
                    variant="ghost"
                    className="gap-2"
                    disabled={pending}
                    onClick={() => setStep('columns')}
                  >
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={pending}
                    onClick={() => runImport(serviceMap)}
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    Import {dataRows.length} contact
                    {dataRows.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'done' && result && (
            <>
              <DialogHeader>
                <DialogTitle>Import complete</DialogTitle>
                <DialogDescription>
                  Your contacts are in the queue with the right niche attached
                  — the call screen will load the matching script
                  automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
                  <CheckCircle2 className="size-6 shrink-0 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {result.imported} contact
                      {result.imported === 1 ? '' : 's'} imported
                    </p>
                    {(result.skippedDuplicate > 0 ||
                      result.skippedInvalid > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {result.skippedDuplicate > 0 &&
                          `${result.skippedDuplicate} skipped as duplicates (phone already in your list)`}
                        {result.skippedDuplicate > 0 &&
                          result.skippedInvalid > 0 &&
                          ' · '}
                        {result.skippedInvalid > 0 &&
                          `${result.skippedInvalid} skipped for missing name or phone`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setOpen(false)
                      reset()
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
