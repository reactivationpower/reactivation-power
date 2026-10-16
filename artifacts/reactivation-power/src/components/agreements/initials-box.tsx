import { useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type SaveResult = { ok: boolean; error?: string }

export function InitialsBox({ sectionId, sectionTitle, value, changed, suggested, onSave, onDraft, reuseLabel, onReuse }: {
  sectionId: string
  sectionTitle: string
  value: string
  changed?: boolean
  suggested?: string
  onSave: (sectionId: string, value: string) => Promise<SaveResult>
  onDraft?: (value: string) => void
  reuseLabel?: string
  onReuse: (sectionId: string) => Promise<SaveResult>
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
    setError(null)
  }
  const saved = Boolean(value && draft.trim().toUpperCase() === value)

  async function commit(reuse = false) {
    const normalized = draft.trim().toUpperCase()
    if (inFlight.current || (!reuse && (!normalized || normalized === value))) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await (reuse ? onReuse(sectionId) : onSave(sectionId, normalized))
      if (!result.ok) setError(result.error ?? 'Could not save initials. Please try again.')
    } catch {
      setError('Could not save initials. Please try again.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3" data-testid={`initials-${sectionId}`} aria-busy={saving}>
      <label htmlFor={`initials-${sectionId}`} className="text-sm font-medium text-foreground">
        Initial here {changed ? <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">Updated — please re-initial</span> : null}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`initials-${sectionId}`}
          value={draft}
          disabled={saving}
          onChange={e => {
            const next = e.target.value.toUpperCase().slice(0, 6)
            setDraft(next)
            onDraft?.(next)
          }}
          onBlur={() => void commit()}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commit()
            }
          }}
          placeholder={suggested || 'AB'}
          maxLength={6}
          autoCapitalize="characters"
          className={`h-11 w-24 text-center text-lg font-semibold uppercase tracking-widest ${saved ? 'border-emerald-500 bg-emerald-50' : ''}`}
          aria-label={`Your initials for ${sectionTitle}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `initials-error-${sectionId}` : undefined}
        />
        {saving ? <span role="status" className="inline-flex items-center gap-1 text-xs"><Loader2 className="size-4 animate-spin" /> Saving…</span>
          : saved ? <span role="status" className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="size-4" /> Saved</span> : null}
      </div>
      {reuseLabel && !draft.trim() ? (
        <Button type="button" variant="outline" className="min-h-11" disabled={saving}
          aria-label={`${reuseLabel} for ${sectionTitle}`} onClick={() => void commit(true)}>
          {reuseLabel}
        </Button>
      ) : null}
      {error ? <p id={`initials-error-${sectionId}`} role="alert" className="w-full text-xs text-destructive">{error}</p> : null}
      {error ? <Button type="button" variant="outline" disabled={saving} onClick={() => void commit(!draft.trim())}
        aria-label={`Retry initials for ${sectionTitle}`}>Retry save</Button> : null}
    </div>
  )
}
