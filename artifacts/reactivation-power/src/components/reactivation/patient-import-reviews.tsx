import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import {
  listPatientImportReviews,
  resolvePatientImportReview,
} from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { formatPhone } from '@workspace/shared/phone'
import type { PatientImportReview } from '@workspace/shared/csv-patients'

type Decision = 'match' | 'create' | 'ignore'
interface Pending {
  reviewId: string
  decision: Decision
  contactId?: string
  candidateName?: string
}

/** Persistent list of imported rows that need a person to decide who they are. */
export function PatientImportReviews({ onChanged }: { onChanged?: () => void }) {
  const [reviews, setReviews] = useState<PatientImportReview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await listPatientImportReviews()
      if (res?.error) setError(res.error)
      else {
        setError(null)
        setReviews(res?.reviews ?? [])
      }
    } catch {
      setError('Could not load review rows. Please retry.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run() {
    if (!confirm) return
    setBusy(true)
    setError(null)
    try {
      const res = await resolvePatientImportReview({
        reviewId: confirm.reviewId,
        decision: confirm.decision,
        ...(confirm.contactId ? { contactId: confirm.contactId } : {}),
      })
      if (res?.error) {
        setError(res.error)
        return
      }
      setConfirm(null)
      await load()
      onChanged?.()
    } catch {
      setError('Could not confirm this decision. Reload the review list before retrying.')
    } finally {
      setBusy(false)
    }
  }

  if (reviews === null && !error) {
    return (
      <div className="h-16 animate-pulse rounded-md bg-muted" data-testid="skeleton-reviews" />
    )
  }
  if (reviews && reviews.length === 0 && !error) return null

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3"
      data-testid="section-import-reviews"
    >
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertCircle className="size-4 text-accent" />
          Rows waiting for your decision{reviews ? ` (${reviews.length})` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          These rows could not be matched safely. Nothing changes until you choose.
        </p>
      </div>
      {error && (
        <div className="flex items-center justify-between gap-2 text-sm text-destructive" data-testid="text-review-error">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()} data-testid="button-retry-reviews">
            Retry
          </Button>
        </div>
      )}
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
        {(reviews ?? []).map((r) => {
          const c = confirm?.reviewId === r.id ? confirm : null
          return (
            <li key={r.id} className="rounded-md border border-border bg-card p-3" data-testid={`row-review-${r.id}`}>
              <p className="text-sm font-medium text-foreground">
                Row {r.row_number}: {r.row.name || 'No name'} · {r.row.phone}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.reason} · Source: {r.source_system}
                {r.row.service ? ` · ${r.row.service}` : ''}
                {r.row.lastVisit ? ` · Last visit ${r.row.lastVisit}` : ''}
              </p>
              {r.candidates.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {r.candidates.map((cand) => (
                    <li key={cand.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">
                        {cand.name}{' '}
                        <span className="text-xs text-muted-foreground">
                          {formatPhone(cand.phone)}
                          {cand.email ? ` · ${cand.email}` : ''}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-testid={`button-match-${r.id}-${cand.id}`}
                        onClick={() =>
                          setConfirm({ reviewId: r.id, decision: 'match', contactId: cand.id, candidateName: cand.name })
                        }
                      >
                        This is the same person
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  data-testid={`button-create-${r.id}`}
                  onClick={() => setConfirm({ reviewId: r.id, decision: 'create' })}
                >
                  Create separate person
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  data-testid={`button-ignore-${r.id}`}
                  onClick={() => setConfirm({ reviewId: r.id, decision: 'ignore' })}
                >
                  Ignore row
                </Button>
              </div>
              {c && (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/10 p-2.5">
                  <p className="text-xs leading-relaxed text-foreground">
                    {c.decision === 'match' &&
                      `Confirm this is ${c.candidateName} and update their contact details and service history? Staff notes, current script and call schedule stay the same. A CSV do-not-call flag will be honored.`}
                    {c.decision === 'create' &&
                      'Create a new person who shares this phone number? They will be a separate record in the reserve pool and will not be merged with anyone.'}
                    {c.decision === 'ignore' &&
                      'Ignore this row? Nothing will be imported from it.'}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void run()} data-testid={`button-confirm-${r.id}`}>
                      {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(null)} data-testid={`button-cancel-${r.id}`}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
