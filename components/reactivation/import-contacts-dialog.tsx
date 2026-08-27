'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
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
  matchNicheByName,
  normalizeServiceLabel,
  suggestNicheForService,
} from '@/lib/niche-match'
import type { Niche, ServiceNicheMapping } from '@/lib/types'
import { cn } from '@/lib/utils'

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
  | 'niche'
  | 'service'
  | 'complaint'
  | 'notes'

const TARGET_LABELS: Record<Target, string> = {
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  email: 'Email',
  niche: 'Niche (script to use)',
  service: 'Service / appointment type',
  complaint: 'Previously treated for',
  notes: 'Notes',
}

/**
 * Header detection runs in two passes so that precise headings always win
 * over loose ones no matter what order the CRM exported them in. Every
 * practice-management system names these columns differently, and the
 * office can still remap anything by hand on the columns step.
 */

// Pass 1 — unambiguous headings.
const STRICT_PATTERNS: Array<[Target, RegExp]> = [
  ['firstName', /^(first[\s_-]?name|fname|first|given[\s_-]?name)$/i],
  [
    'lastName',
    /^(last[\s_-]?name|lname|last|surname|family[\s_-]?name)$/i,
  ],
  [
    'name',
    /^((full|patient|client|customer|contact|display)[\s_-]?)?name$|^(patient|client|customer)$|^name[\s_-]?of[\s_-]?patient$|^patient[\s_-]?full[\s_-]?name$/i,
  ],
  // Prefer a mobile line: it's the number most likely to be answered
  ['phone', /^(mobile|cell)[\s_-]?(phone|number|no|#)?$|^(phone|primary|preferred)[\s_-]?(mobile|cell)$/i],
  ['email', /^(e-?mail|email[\s_-]?address|e-?mail[\s_-]?1)$/i],
  // Before "service" so a dedicated niche column always wins
  [
    'niche',
    /^(niche|niche[\s_-]?name|script|script[\s_-]?type|campaign|category|patient[\s_-]?type|patient[\s_-]?category|treatment[\s_-]?category|service[\s_-]?line|specialty|speciality|segment|tag)$/i,
  ],
  [
    'service',
    /^(service|services|last[\s_-]?service|appointment[\s_-]?type|appt[\s_-]?type|treatment|treatment[\s_-]?type|procedure|visit[\s_-]?type|product|package|program)$/i,
  ],
  [
    'complaint',
    /^(complaint|original[\s_-]?complaint|chief[\s_-]?complaint|condition|treated[\s_-]?for|previously[\s_-]?treated[\s_-]?for|diagnosis|concern)$/i,
  ],
  ['notes', /^(note|notes|comment|comments|memo|remarks)$/i],
]

// Pass 2 — looser "contains" fallbacks for headings we didn't recognize.
const LOOSE_PATTERNS: Array<[Target, RegExp]> = [
  ['phone', /(phone|mobile|cell|tel\b|contact[\s_-]?number)/i],
  ['email', /e-?mail/i],
  ['firstName', /first[\s_-]?name/i],
  ['lastName', /last[\s_-]?name/i],
  ['name', /\bname\b/i],
  ['niche', /(niche|script|campaign)/i],
  [
    'service',
    /(service|appointment[\s_-]?type|appt[\s_-]?type|treatment|procedure|visit[\s_-]?type|product|package|program)/i,
  ],
  ['complaint', /(complaint|condition|treated[\s_-]?for|diagnosis|concern)/i],
  ['notes', /(note|comment|memo|remark)/i],
]

function detectColumns(headers: string[]): Partial<Record<Target, number>> {
  const map: Partial<Record<Target, number>> = {}
  const claimed = new Set<number>()

  for (const patterns of [STRICT_PATTERNS, LOOSE_PATTERNS]) {
    for (const [target, pattern] of patterns) {
      if (map[target] !== undefined) continue
      for (let idx = 0; idx < headers.length; idx++) {
        if (claimed.has(idx)) continue
        if (pattern.test(headers[idx].trim())) {
          map[target] = idx
          claimed.add(idx)
          break
        }
      }
    }
  }

  // A full-name column is redundant when first/last both came through
  if (
    map.name !== undefined &&
    map.firstName !== undefined &&
    map.lastName !== undefined
  ) {
    delete map.name
  }
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
    unmatchedNiches: string[]
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

  /** Services we couldn't recognize and the office hasn't assigned yet */
  const unreviewedServices = useMemo(
    () => uniqueServices.filter((s) => serviceMap[s.key] === undefined).length,
    [uniqueServices, serviceMap],
  )

  /**
   * What the Niche column actually resolves to, so the office can fix a
   * typo before importing instead of discovering it on a call.
   */
  const nichePreview = useMemo(() => {
    const idx = columns.niche
    if (idx === undefined) return null
    const counts = new Map<string, number>()
    let blank = 0
    for (const r of dataRows) {
      const raw = (r[idx] ?? '').trim()
      if (!raw) {
        blank++
        continue
      }
      counts.set(raw, (counts.get(raw) ?? 0) + 1)
    }
    // Group by the niche we resolved to, so "Spinal Decompression" and
    // "Decompression" show as one line rather than two
    const byNiche = new Map<string, number>()
    const unmatched: Array<{ label: string; count: number }> = []
    for (const [label, count] of counts) {
      const hit = matchNicheByName(label, niches)
      if (hit) byNiche.set(hit.name, (byNiche.get(hit.name) ?? 0) + count)
      else unmatched.push({ label, count })
    }
    const matched = Array.from(byNiche, ([niche, count]) => ({ niche, count }))
    matched.sort((a, b) => b.count - a.count)
    unmatched.sort((a, b) => b.count - a.count)
    return { matched, unmatched, blank }
  }, [dataRows, columns.niche, niches])

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
    const detected = detectColumns(parsed[0] ?? [])
    const looksLikeHeaders = Object.keys(detected).length > 0

    // Headings but nothing under them — usually a filter left applied in
    // the CRM, or only the header row got copied
    if (looksLikeHeaders && parsed.length < 2) {
      setError(
        'That file has column headings but no patients under them. Check that your export included the rows, then try again.',
      )
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

    // A Niche column answers the question per contact already
    if (columns.niche !== undefined) {
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
      }
      // Deliberately left unset when nothing matched, so the row can be
      // flagged for review instead of silently sitting on the default
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
        niche:
          columns.niche !== undefined ? (r[columns.niche] ?? '').trim() : '',
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
        unmatchedNiches: res.unmatchedNiches ?? [],
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
    { value: AUTO, label: 'Auto-match from the file' },
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
                  software and upload it here. Add a Niche column to the export
                  and every patient arrives tagged with the script they should
                  be called on — no switching scripts mid-list.
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
                    Include columns for name, phone, and (ideally) a Niche
                    column
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
                    the columns are pre-named so they match automatically, and
                    it lists the exact niche names your account can use.
                  </p>
                  <a
                    href="/api/templates/contacts"
                    download
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="size-3.5" />
                    CSV template
                  </a>
                </div>
                {niches.length > 0 && (
                  <details className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                    <summary className="cursor-pointer text-xs font-medium text-foreground">
                      Niche values you can put in the Niche column (
                      {niches.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {niches.map((n) => (
                        <span
                          key={n.id}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                        >
                          {n.name}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Close matches work too — {'"'}Ortho{'"'}, {'"'}Invisalign
                      {'"'} or {'"'}shockwave{'"'} all land on the right script.
                    </p>
                  </details>
                )}
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
                      ? 'Each contact is tagged from their own Niche column when your file has one, then the service column, then your account default. Or pick a niche to tag every contact in this file with it.'
                      : `Every contact in this file will be tagged ${nicheById.get(fileNiche)?.name ?? 'the selected niche'} and get that script when called — this overrides any Niche column on the file.`}
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
                    ['name', 'firstName', 'lastName', 'phone', 'email', 'niche', 'service', 'complaint', 'notes'] as Target[]
                  ).map((target) => (
                    <div key={target} className="flex flex-col gap-1.5">
                      <Label className="text-xs">
                        {TARGET_LABELS[target]}
                        {target === 'phone' && ' *'}
                        {target === 'niche' && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            (best option)
                          </span>
                        )}
                        {target === 'service' && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            (fallback matching)
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
                {nichePreview && fileNiche === AUTO && (
                  <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Sparkles className="size-3.5 text-accent" />
                      Niche column found — each patient keeps their own script
                    </p>
                    {nichePreview.matched.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {nichePreview.matched.map((m) => (
                          <span
                            key={m.niche}
                            className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                          >
                            {m.niche}
                            <span className="ml-1 text-muted-foreground">
                              {m.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {nichePreview.unmatched.length > 0 && (
                      <p className="text-xs leading-relaxed text-destructive">
                        {"We don't recognize "}
                        {nichePreview.unmatched
                          .map((u) => `"${u.label}" (${u.count})`)
                          .join(', ')}
                        {
                          '. Check the spelling against your niche list, or those contacts will fall back to your account default'
                        }
                        {defaultNicheName ? ` (${defaultNicheName})` : ''}.
                      </p>
                    )}
                    {nichePreview.blank > 0 && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {nichePreview.blank} row
                        {nichePreview.blank === 1 ? ' has' : 's have'} no niche
                        listed and will use your account default
                        {defaultNicheName ? ` (${defaultNicheName})` : ''}.
                      </p>
                    )}
                  </div>
                )}
                {columns.niche === undefined &&
                  columns.service === undefined &&
                  fileNiche === AUTO && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      No niche or service column selected — every imported
                      contact will use your account default niche
                      {defaultNicheName ? ` (${defaultNicheName})` : ''}. Adding
                      a Niche column to your export is the cleanest way to let
                      each contact get the right script. Or pick a niche for
                      this file above.
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
                    {fileNiche !== AUTO ||
                    columns.niche !== undefined ||
                    columns.service === undefined
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
                {unreviewedServices > 0 && (
                  <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {unreviewedServices === 1
                      ? "1 service we couldn't recognize. Those contacts go to your account default unless you pick a niche below."
                      : `${unreviewedServices} services we couldn't recognize. Those contacts go to your account default unless you pick a niche below.`}
                  </p>
                )}
                <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                  {uniqueServices.map((s) => {
                    const needsReview = serviceMap[s.key] === undefined
                    return (
                    <li
                      key={s.key}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2',
                        needsReview
                          ? 'border-destructive/40 bg-destructive/5'
                          : 'border-border bg-card',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {s.label}
                        </p>
                        <p
                          className={cn(
                            'text-xs',
                            needsReview
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {needsReview
                            ? `Not recognized — ${s.count} contact${s.count === 1 ? '' : 's'}`
                            : `${s.count} contact${s.count === 1 ? '' : 's'}`}
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
                    )
                  })}
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
                {result.unmatchedNiches.length > 0 && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                    {"These niche values weren't recognized: "}
                    {result.unmatchedNiches.join(', ')}. Those contacts are
                    using your account default instead — you can fix each one
                    from the contacts table, or re-export with the exact niche
                    name and import again.
                  </p>
                )}
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
