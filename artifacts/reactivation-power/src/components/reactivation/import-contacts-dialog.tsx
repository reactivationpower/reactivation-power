// @ts-nocheck

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
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
import {
  NicheSelect,
  nicheDisplayLabel,
} from '@/components/reactivation/niche-select'
import { Textarea } from '@/components/ui/textarea'
import {
  matchNicheByName,
  normalizeServiceLabel,
  suggestNicheForService,
} from '@workspace/niche-catalog'
import type { Niche, ServiceNicheMapping } from '@workspace/shared/types'
import { cn } from '@/lib/utils'
import { useRouter } from '@/hooks/use-router'
import { detectColumnsWith, dropRedundantFullName, parseCsv } from '@/lib/csv-import'
import { PatientImportReviews } from '@/components/reactivation/patient-import-reviews'
import { Input } from '@/components/ui/input'
import { ImportProgress } from '@/components/portal/import-progress'
import type { PatientImportSummary } from '@workspace/shared/csv-patients'

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
  | 'patientId'
  | 'lastVisit'
  | 'doNotCall'

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
  patientId: 'Patient ID (EHR / CSV)',
  lastVisit: 'Last visit (YYYY-MM-DD or M/D/YYYY)',
  doNotCall: 'Do not call (true / yes / 1)',
}

/**
 * Header detection runs in two passes so that precise headings always win
 * over loose ones no matter what order the CRM exported them in. Every
 * practice-management system names these columns differently, and the
 * office can still remap anything by hand on the columns step.
 */

// Pass 1 — unambiguous headings.
const STRICT_PATTERNS: Array<[Target, RegExp]> = [
  // "First Name", "Patient First", "Pt First Name", "Given Name", "FName"
  [
    'firstName',
    /^((patient|pt|client|customer|contact)[\s_-]?)?(first[\s_-]?name|fname|first|given[\s_-]?name)$/i,
  ],
  [
    'lastName',
    /^((patient|pt|client|customer|contact)[\s_-]?)?(last[\s_-]?name|lname|last|surname|family[\s_-]?name)$/i,
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
  ['patientId', /^(patient|pt|chart|mrn|ehr|client|external)[\s_-]?(id|number|no|#)$|^id$/i],
  ['lastVisit', /^(last[\s_-]?(visit|seen|appt|appointment)([\s_-]?date)?|date[\s_-]?of[\s_-]?last[\s_-]?visit|last[\s_-]?service[\s_-]?date)$/i],
  ['doNotCall', /^(do[\s_-]?not[\s_-]?(call|contact)|dnc|opt[\s_-]?out)$/i],
]

// Pass 2 — looser "contains" fallbacks for headings we didn't recognize.
const LOOSE_PATTERNS: Array<[Target, RegExp]> = [
  ['phone', /(phone|mobile|cell|tel\b|contact[\s_-]?number)/i],
  ['email', /e-?mail/i],
  ['firstName', /first[\s_-]?name|\bfirst\b/i],
  // A bare "last" is a surname unless it's clearly a date or service
  // ("Last Visit", "Last Service", "Last Appt Date")
  [
    'lastName',
    /last[\s_-]?name|\blast\b(?![\s_-]?(visit|service|seen|appt|appointment|date|call|contact|treatment|procedure))/i,
  ],
  ['name', /\bname\b/i],
  ['niche', /(niche|script|campaign)/i],
  [
    'service',
    /(service|appointment[\s_-]?type|appt[\s_-]?type|treatment|procedure|visit[\s_-]?type|product|package|program)/i,
  ],
  ['complaint', /(complaint|condition|treated[\s_-]?for|diagnosis|concern)/i],
  ['notes', /(note|comment|memo|remark)/i],
  ['lastVisit', /last[\s_-]?(visit|seen)/i],
  ['doNotCall', /(do[\s_-]?not[\s_-]?call|\bdnc\b)/i],
]

function detectColumns(headers: string[]): Partial<Record<Target, number>> {
  const map = detectColumnsWith(headers, STRICT_PATTERNS, LOOSE_PATTERNS)
  dropRedundantFullName(map)
  return map
}

// ---------- component ----------

type Step = 'upload' | 'columns' | 'services' | 'importing' | 'done'

const NONE = '__none__'
const DEFAULT = '__default__'
const AUTO = '__auto__'

/** Order the mapping rows appear in — the fields an office actually thinks in */
const MAPPING_ORDER: Target[] = [
  'name',
  'firstName',
  'lastName',
  'phone',
  'email',
  'niche',
  'service',
  'complaint',
  'notes',
  'patientId',
  'lastVisit',
  'doNotCall',
]

/** How many real values from the file to show beside each mapped field */
const SAMPLE_COUNT = 3

/** Progress bar for the import step — fills left to right, then snaps to 100 when the server answers */

interface Props {
  /** Niches enabled on this account (what a value can resolve to) */
  niches: Niche[]
  /**
   * Every active niche in the account's sectors — used only to tell apart a
   * value that's a real niche the account hasn't enabled from a true typo.
   */
  allNiches: Niche[]
  savedMappings: ServiceNicheMapping[]
  defaultNicheName: string | null
  /**
   * Demo account only: a ready-made CSV the presenter can load with one click
   * so no file is needed on their laptop. The server never writes demo
   * imports, so the whole flow is safe to run live in front of a prospect.
   */
  demoSampleCsv?: { filename: string; csv: string } | null
}

export function ImportContactsDialog({
  niches,
  allNiches,
  savedMappings,
  defaultNicheName,
  demoSampleCsv = null,
}: Props) {
  const router = useRouter()
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
  const [dragActive, setDragActive] = useState(false)
  const [sourceSystem, setSourceSystem] = useState('csv')
  const [result, setResult] = useState<PatientImportSummary | null>(null)
  const [importDone, setImportDone] = useState(false)
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
    // Real niches that aren't enabled on this account, grouped by canonical
    // name — these need a "contact the team to enable" message
    const notEnabled = new Map<string, number>()
    const unmatched: Array<{ label: string; count: number }> = []
    for (const [label, count] of counts) {
      const hit = matchNicheByName(label, niches)
      if (hit) {
        byNiche.set(hit.name, (byNiche.get(hit.name) ?? 0) + count)
        continue
      }
      const systemHit = matchNicheByName(label, allNiches)
      if (systemHit) {
        notEnabled.set(
          systemHit.name,
          (notEnabled.get(systemHit.name) ?? 0) + count,
        )
      } else {
        unmatched.push({ label, count })
      }
    }
    const matched = Array.from(byNiche, ([niche, count]) => ({ niche, count }))
    const notEnabledList = Array.from(notEnabled, ([niche, count]) => ({
      niche,
      count,
    }))
    matched.sort((a, b) => b.count - a.count)
    notEnabledList.sort((a, b) => b.count - a.count)
    unmatched.sort((a, b) => b.count - a.count)
    return { matched, notEnabled: notEnabledList, unmatched, blank }
  }, [dataRows, columns.niche, niches, allNiches])

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
    setImportDone(false)
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    // Accept anything that looks like a CSV/plain-text export; some CRMs
    // hand out an empty MIME type, so fall back to the file extension
    const isCsv =
      /\.(csv|txt)$/i.test(file.name) ||
      file.type === 'text/csv' ||
      file.type === 'text/plain' ||
      file.type === ''
    if (!isCsv) {
      setError('That does not look like a CSV file. Please drop a .csv export.')
      return
    }
    void handleFile(file)
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
        patientId: columns.patientId !== undefined ? (r[columns.patientId] ?? '').trim() : '',
        lastVisit: columns.lastVisit !== undefined ? (r[columns.lastVisit] ?? '').trim() : '',
        doNotCall: columns.doNotCall !== undefined ? (r[columns.doNotCall] ?? '').trim() : '',
      }
    })
  }

  function runImport(map: Record<string, string>) {
    setError(null)
    const returnTo: Step = step === 'services' ? 'services' : 'columns'
    setImportDone(false)
    setStep('importing')
    const startedAt = Date.now()
    startTransition(async () => {
      const mappings = Object.entries(map)
        .filter(([, v]) => v !== DEFAULT)
        .map(([service_label, v]) => ({
          service_label,
          niche_id: v === NONE ? null : v,
        }))
      let res
      try {
        res = await importContacts({
          rows: buildRows(),
          mappings,
          forceNicheId: fileNiche !== AUTO ? fileNiche : null,
          sourceSystem: sourceSystem.trim() || 'csv',
        })
      } catch {
        setError('Could not confirm the upload result. Check your contacts before retrying; repeating the same file is safe.')
        setStep(returnTo)
        return
      }
      if (res?.error) {
        setError(res.error)
        setStep(returnTo)
        return
      }
      // Let the bar be visible long enough to read on small files
      const elapsed = Date.now() - startedAt
      if (elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed))
      setImportDone(true)
      await new Promise((r) => setTimeout(r, 450))
      setResult({
        ...res,
        imported: res.imported ?? 0,
        updated: res.updated ?? 0,
        servicesAdded: res.servicesAdded ?? 0,
        unchanged: res.unchanged ?? 0,
        needsReview: res.needsReview ?? 0,
        skippedInvalid: res.skippedInvalid ?? 0,
        invalidRows: res.invalidRows ?? [],
        unmatchedNiches: res.unmatchedNiches ?? [],
        notEnabledNiches: res.notEnabledNiches ?? [],
      })
      setStep('done')
      router.refresh()
    })
  }

  /** First few non-blank values in a column, so the office can sanity-check a mapping at a glance */
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

  const nicheItems = [
    {
      value: DEFAULT,
      label: defaultNicheName
        ? `Account default (${nicheDisplayLabel(defaultNicheName)})`
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
        Upload Contacts
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
                <DialogTitle>Upload Contacts</DialogTitle>
                <DialogDescription>
                  Export your patient or customer list from your management
                  software as a CSV and upload it here. Add a Niche column to
                  the export and every patient arrives tagged with the script
                  they should be called on — no switching scripts mid-list.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                {demoSampleCsv ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Demo: use the sample patient export
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A realistic 24-patient CSV with a Niche column — no
                        file needed. Nothing is written to the demo account.
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="shrink-0 gap-2"
                      onClick={() =>
                        loadText(demoSampleCsv.csv, demoSampleCsv.filename)
                      }
                    >
                      <FileSpreadsheet className="size-4" />
                      Load sample file
                    </Button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    setDragActive(false)
                  }}
                  onDrop={handleDrop}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                    dragActive
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-muted/40 hover:border-accent hover:bg-accent/5',
                  )}
                >
                  <FileSpreadsheet
                    className={cn(
                      'size-8',
                      dragActive ? 'text-accent' : 'text-muted-foreground',
                    )}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {dragActive
                      ? 'Drop your CSV file here'
                      : 'Drag & drop a CSV file, or click to choose'}
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
                <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Not sure how to format your list? Start from a sample file
                    — one row for each of your {niches.length} niche
                    {niches.length === 1 ? '' : 's'}, columns pre-named so they
                    match automatically. They double as demo files.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/api/templates/contacts?variant=niche"
                      download
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="size-3.5" />
                      Sample with Niche column
                    </a>
                    <a
                      href="/api/templates/contacts?variant=services"
                      download
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="size-3.5" />
                      Sample without Niche (services only)
                    </a>
                  </div>
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
                          {nicheDisplayLabel(n.name)}
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
                <PatientImportReviews onChanged={() => router.refresh()} />
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
                    {dataRows.length} contact{dataRows.length === 1 ? '' : 's'}{' '}
                    detected.
                  </span>{' '}
                  We matched what we could — check the sample values on each
                  row to confirm the right column is picked.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <Label htmlFor="file-niche" className="text-xs">
                    Niche for this file
                  </Label>
                  <NicheSelect
                    value={fileNiche}
                    onValueChange={(v) => {
                      if (v) setFileNiche(v)
                    }}
                    items={fileNicheItems}
                    id="file-niche"
                    className="min-h-9"
                    aria-label="Niche for this file"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {fileNiche === AUTO
                      ? 'Each contact is tagged from their own Niche column when your file has one, then the service column, then your account default. Or pick a niche to tag every contact in this file with it.'
                      : `Every contact in this file will be tagged ${nicheDisplayLabel(nicheById.get(fileNiche)?.name ?? 'the selected niche')} and get that script when called — this overrides any Niche column on the file.`}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <Label htmlFor="source-system" className="text-xs">
                    Source system
                  </Label>
                  <Input
                    id="source-system"
                    value={sourceSystem}
                    onChange={(e) => setSourceSystem(e.target.value)}
                    placeholder="csv"
                    className="h-9"
                    data-testid="input-source-system"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Use the same source label every time you upload from the same system (for example, the name of your EHR) so Patient IDs match across uploads.
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
                {/* One row per field: their column | our field | what's actually in it */}
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
                        (target === 'name' &&
                          columns.firstName === undefined) ||
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
                              className={cn(
                                'h-9 min-w-0',
                                idx === undefined && 'text-muted-foreground',
                              )}
                              aria-label={`Your column for ${TARGET_LABELS[target]}`}
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
                          <div className="flex min-w-0 items-center gap-1.5">
                            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium text-foreground">
                              {TARGET_LABELS[target]}
                              {required && (
                                <span className="text-destructive"> *</span>
                              )}
                            </span>
                            {target === 'niche' && (
                              <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                best
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 text-xs text-muted-foreground">
                            {idx === undefined ? (
                              <span className="italic">Not in this file</span>
                            ) : samples.length === 0 ? (
                              <span className="italic">Column is empty</span>
                            ) : (
                              <span className="block truncate" title={samples.join(' · ')}>
                                {samples.map((s, i) => (
                                  <span key={i}>
                                    {i > 0 && (
                                      <span className="text-border"> · </span>
                                    )}
                                    <span className="text-foreground">{s}</span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
                {nichePreview &&
                  fileNiche === AUTO &&
                  nichePreview.notEnabled.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-md border-2 border-destructive bg-destructive/10 px-4 py-3">
                      <p className="flex items-center gap-2 text-sm font-bold text-destructive">
                        <AlertCircle className="size-5 shrink-0" />
                        Some niches in your file aren&apos;t turned on for this
                        account
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {nichePreview.notEnabled.map((m) => (
                          <span
                            key={m.niche}
                            className="rounded-full border border-destructive/40 bg-background px-2 py-0.5 text-xs font-medium text-foreground"
                          >
                            {m.niche}
                            <span className="ml-1 text-muted-foreground">
                              {m.count}
                            </span>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs leading-relaxed text-foreground">
                        These are real niches, but they aren&apos;t enabled on
                        your account yet. These contacts will still import with
                        the correct niche attached, but they&apos;ll be marked{' '}
                        <span className="font-semibold">
                          &ldquo;not active&rdquo;
                        </span>{' '}
                        and can&apos;t be called until the niche is turned on.{' '}
                        <span className="font-semibold">
                          Contact the Reactivation Power team to turn these
                          niches on, then refresh this page
                        </span>{' '}
                        — those patients will be ready to call with the right
                        script automatically.
                      </p>
                    </div>
                  )}
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
                        {defaultNicheName
                          ? ` (${nicheDisplayLabel(defaultNicheName)})`
                          : ''}.
                      </p>
                    )}
                    {nichePreview.blank > 0 && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {nichePreview.blank} row
                        {nichePreview.blank === 1 ? ' has' : 's have'} no niche
                        listed and will use your account default
                        {defaultNicheName
                          ? ` (${nicheDisplayLabel(defaultNicheName)})`
                          : ''}.
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
                      {defaultNicheName
                        ? ` (${nicheDisplayLabel(defaultNicheName)})`
                        : ''}. Adding
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
                      ? `Upload ${dataRows.length} contact${dataRows.length === 1 ? '' : 's'}`
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
                      <NicheSelect
                        value={serviceMap[s.key] ?? DEFAULT}
                        onValueChange={(v) => {
                          if (!v) return
                          setServiceMap((prev) => ({ ...prev, [s.key]: v }))
                        }}
                        items={nicheItems}
                        className="min-h-9 w-56"
                        aria-label={`Niche for ${s.label}`}
                      />
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
                    Upload {dataRows.length} contact
                    {dataRows.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'importing' && (
            <>
              <DialogHeader>
                <DialogTitle>Uploading contacts</DialogTitle>
                <DialogDescription>
                  {fileName ? `${fileName} — ` : ''}
                  {dataRows.length} contact{dataRows.length === 1 ? '' : 's'}{' '}
                  detected. Hang tight, this only takes a moment.
                </DialogDescription>
              </DialogHeader>
              <ImportProgress
                total={dataRows.length}
                done={importDone}
                label="Contacts uploaded"
              />
            </>
          )}

          {step === 'done' && result && (
            <>
              <DialogHeader>
                <DialogTitle>Upload complete</DialogTitle>
                <DialogDescription>
                  Your contacts are in the queue with the right niche attached
                  — the call screen will load the matching script
                  automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3">
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-accent" />
                  <div className="flex flex-col gap-1.5">
                    {result.simulated && (
                      <p className="text-xs font-semibold text-accent" data-testid="text-simulated">
                        Simulated import: nothing was saved.
                      </p>
                    )}
                    <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-foreground sm:grid-cols-2" data-testid="list-import-summary">
                      <li data-testid="text-imported"><span className="font-semibold">{result.imported}</span> new {result.imported === 1 ? 'person' : 'people'} added to the reserve pool</li>
                      <li data-testid="text-updated"><span className="font-semibold">{result.updated}</span> existing {result.updated === 1 ? 'person' : 'people'} updated</li>
                      <li data-testid="text-services-added"><span className="font-semibold">{result.servicesAdded}</span> service{result.servicesAdded === 1 ? '' : 's'} added to history</li>
                      <li data-testid="text-unchanged"><span className="font-semibold">{result.unchanged}</span> unchanged</li>
                      <li data-testid="text-needs-review"><span className="font-semibold">{result.needsReview}</span> need{result.needsReview === 1 ? 's' : ''} your review</li>
                      <li data-testid="text-skipped-invalid"><span className="font-semibold">{result.skippedInvalid}</span> skipped for missing name or phone</li>
                    </ul>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Additional services are saved as history only. A person's current script and call schedule do not change, and nothing extra is queued.
                    </p>
                  </div>
                </div>
                {result.needsReview > 0 && !result.simulated && (
                  <PatientImportReviews onChanged={() => router.refresh()} />
                )}
                {!!result.invalidRows?.length && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="font-semibold">Rows not imported</p>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Correct these rows and upload again. Data row numbers exclude the header.
                      {result.skippedInvalid > result.invalidRows.length && ' Showing the first 12 invalid rows.'}
                    </p>
                    <ul className="space-y-1 text-xs">
                      {result.invalidRows.map(r => <li key={r.rowNumber}>Data row {r.rowNumber}: {r.reason}</li>)}
                    </ul>
                  </div>
                )}
                {result.notEnabledNiches.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-md border-2 border-destructive bg-destructive/10 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-destructive">
                      <AlertCircle className="size-5 shrink-0" />
                      Some niches aren&apos;t turned on for this account
                    </p>
                    <p className="text-xs leading-relaxed text-foreground">
                      {result.notEnabledNiches.join(', ')}{' '}
                      {result.notEnabledNiches.length === 1
                        ? 'is a real niche that isn\u2019t'
                        : 'are real niches that aren\u2019t'}{' '}
                      enabled on your account yet. Those contacts were imported
                      with the correct niche attached, but they&apos;re marked{' '}
                      <span className="font-semibold">
                        &ldquo;not active&rdquo;
                      </span>{' '}
                      and can&apos;t be called until the niche is turned on.{' '}
                      <span className="font-semibold">
                        Contact the Reactivation Power team to enable{' '}
                        {result.notEnabledNiches.length === 1 ? 'it' : 'them'},
                        then refresh this page
                      </span>{' '}
                      — those contacts will be ready to call with the right
                      script automatically. No re-import needed.
                    </p>
                  </div>
                )}
                {result.unmatchedNiches.length > 0 && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                    {"These niche values weren't recognized: "}
                    {result.unmatchedNiches.join(', ')}. Those contacts are
                    using your account default instead — select them in the
                    contacts table and use Assign niche to fix them in one go,
                    or re-export with the exact niche name and upload again.
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
