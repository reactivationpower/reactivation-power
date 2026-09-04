'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  CheckSquare,
  Loader2,
  Lock,
  Phone,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import type { ContactWithMeta } from '@/lib/data/reactivation'
import type { Niche, PipelineStage } from '@/lib/types'
import { DISPOSITION_LABELS } from '@/lib/types'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { bulkAssignNiche, bulkDeleteContacts } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DeleteContactButton } from '@/components/reactivation/delete-contact-button'

const ALL = '__all__'
const DNC = '__dnc__'
const NO_NICHE = '__none__'

function fmtDate(iso: string, withTime = false) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

/**
 * One lowercase string per contact containing every value a caller might
 * type to find them — name, phone in every shape, email, niche, stage,
 * last-call outcome and dates, service label, complaint, notes.
 */
function haystack(c: ContactWithMeta): string {
  const digits = c.phone.replace(/\D/g, '')
  const parts = [
    c.name,
    c.phone,
    digits,
    formatPhone(c.phone),
    c.email ?? '',
    c.niche?.name ?? 'no niche',
    c.niche && !c.niche_active ? 'not active' : '',
    c.stage?.name ?? '',
    c.do_not_call ? 'dnc do not call' : '',
    c.last_call
      ? `${DISPOSITION_LABELS[c.last_call.disposition]} ${fmtDate(c.last_call.created_at)} ${new Date(c.last_call.created_at).toLocaleDateString()}`
      : 'never called',
    c.next_follow_up ? fmtDate(c.next_follow_up.due_at) : '',
    c.service_label ?? '',
    c.original_complaint ?? '',
    c.notes ?? '',
  ]
  return parts.join(' ').toLowerCase()
}

export function ContactsTable({
  contacts,
  stages,
  niches,
  canBulkEdit = false,
}: {
  contacts: ContactWithMeta[]
  stages: PipelineStage[]
  niches: Niche[]
  /** Owner only: shows the checkbox column and bulk actions */
  canBulkEdit?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<string>(ALL)
  const [nicheFilter, setNicheFilter] = useState<string>(ALL)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkNiche, setBulkNiche] = useState<string>('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const lastIndexRef = useRef<number | null>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)

  const indexed = useMemo(
    () => contacts.map((c) => ({ c, hay: haystack(c) })),
    [contacts],
  )

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    return indexed
      .filter(({ c }) => {
        if (stageFilter === DNC) return c.do_not_call
        if (stageFilter !== ALL)
          return c.stage_id === stageFilter && !c.do_not_call
        return true
      })
      .filter(({ c }) => {
        if (nicheFilter === ALL) return true
        if (nicheFilter === NO_NICHE) return !c.niche_id
        return c.niche_id === nicheFilter
      })
      .filter(({ hay }) => tokens.every((t) => hay.includes(t)))
      .map(({ c }) => c)
  }, [indexed, query, stageFilter, nicheFilter])

  // Drop selections that are no longer on screen or were deleted
  useEffect(() => {
    const ids = new Set(contacts.map((c) => c.id))
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [contacts])

  const selectedVisible = filtered.filter((c) => selected.has(c.id)).length
  const allVisibleSelected =
    filtered.length > 0 && selectedVisible === filtered.length

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate =
        selectedVisible > 0 && !allVisibleSelected
    }
  }, [selectedVisible, allVisibleSelected])

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) filtered.forEach((c) => next.delete(c.id))
      else filtered.forEach((c) => next.add(c.id))
      return next
    })
    lastIndexRef.current = null
  }, [allVisibleSelected, filtered])

  /** Checkbox click with shift held selects the whole range since the last click. */
  function onRowCheck(index: number, shiftKey: boolean) {
    const id = filtered[index].id
    setSelected((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastIndexRef.current !== null) {
        const [a, b] = [lastIndexRef.current, index].sort((x, y) => x - y)
        const turnOn = !prev.has(id)
        for (let i = a; i <= b; i++) {
          if (turnOn) next.add(filtered[i].id)
          else next.delete(filtered[i].id)
        }
      } else if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    lastIndexRef.current = index
  }

  function onRowClick(e: React.MouseEvent<HTMLTableRowElement>, id: string) {
    const target = e.target as HTMLElement
    // Interactive children handle their own clicks
    if (target.closest('a, button, input, select, [role="combobox"], [data-no-row-click]'))
      return
    if (e.shiftKey && canBulkEdit) {
      const idx = filtered.findIndex((c) => c.id === id)
      if (idx >= 0) onRowCheck(idx, true)
      return
    }
    router.push(`/portal/contacts/${id}`)
  }

  function clearSelection() {
    setSelected(new Set())
    lastIndexRef.current = null
    setBulkError(null)
  }

  function runBulkDelete() {
    const ids = [...selected]
    if (
      !window.confirm(
        `Delete ${ids.length} contact${ids.length === 1 ? '' : 's'}? This removes their call history too and cannot be undone.`,
      )
    )
      return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkDeleteContacts(ids)
      if (res?.error) {
        setBulkError(res.error)
        return
      }
      clearSelection()
      router.refresh()
    })
  }

  function runBulkAssign() {
    const ids = [...selected]
    if (!bulkNiche) return
    setBulkError(null)
    startTransition(async () => {
      const res = await bulkAssignNiche(
        ids,
        bulkNiche === NO_NICHE ? null : bulkNiche,
      )
      if (res?.error) {
        setBulkError(res.error)
        return
      }
      clearSelection()
      setBulkNiche('')
      router.refresh()
    })
  }

  const nicheFilterItems = [
    { value: ALL, label: 'All niches' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
    { value: NO_NICHE, label: 'No niche' },
  ]
  const bulkNicheItems = [
    ...niches.map((n) => ({ value: n.id, label: n.name })),
    { value: NO_NICHE, label: 'Clear niche' },
  ]

  const showingAll = filtered.length === contacts.length

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything — name, phone, email, niche, stage, last call…"
            className="h-10 pl-9 pr-9"
            aria-label="Search contacts"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select
          value={nicheFilter}
          onValueChange={(v) => v && setNicheFilter(v)}
          items={nicheFilterItems}
        >
          <SelectTrigger className="h-10 w-56" aria-label="Filter by niche">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {nicheFilterItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground tabular-nums">
          {showingAll
            ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`
            : `Showing ${filtered.length} of ${contacts.length}`}
        </p>
      </div>

      {/* Stage chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStageFilter(ALL)}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            stageFilter === ALL
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          All ({contacts.length})
        </button>
        {stages.map((stage) => {
          const count = contacts.filter(
            (c) => c.stage_id === stage.id && !c.do_not_call,
          ).length
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setStageFilter(stage.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                stageFilter === stage.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {stage.name} ({count})
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setStageFilter(DNC)}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            stageFilter === DNC
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          Do Not Call ({contacts.filter((c) => c.do_not_call).length})
        </button>
      </div>

      {/* Bulk action bar */}
      {canBulkEdit && selected.size > 0 && (
        <div
          className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 shadow-sm backdrop-blur"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckSquare className="size-4 text-accent" />
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={bulkNiche}
              onValueChange={(v) => v && setBulkNiche(v)}
              items={bulkNicheItems}
            >
              <SelectTrigger
                className="h-9 w-56 bg-card"
                aria-label="Niche to assign"
              >
                <SelectValue placeholder="Assign niche…" />
              </SelectTrigger>
              <SelectContent>
                {bulkNicheItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={pending || !bulkNiche}
              onClick={runBulkAssign}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Tag className="size-3.5" />
              )}
              Apply
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
            onClick={runBulkDelete}
          >
            <Trash2 className="size-3.5" />
            Delete {selected.size}
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
          {bulkError && (
            <p className="basis-full text-sm text-destructive">{bulkError}</p>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-card p-10 text-center">
          <p className="font-medium text-foreground">
            {contacts.length === 0 ? 'No contacts yet' : 'No matches'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {contacts.length === 0
              ? 'Upload your list or add a contact to get started.'
              : 'Try a different search or clear the filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {canBulkEdit && (
                  <th className="w-12 px-4 py-3">
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="size-4 cursor-pointer accent-primary"
                      aria-label={
                        allVisibleSelected
                          ? 'Deselect all visible contacts'
                          : 'Select all visible contacts'
                      }
                    />
                  </th>
                )}
                <th className="whitespace-nowrap px-4 py-3 font-medium">Name</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Phone</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Email</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Niche</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Stage</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Last Call
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Next Follow-up
                </th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, index) => {
                const isSelected = selected.has(c.id)
                const nicheInactive = !!c.niche && !c.niche_active
                return (
                  <tr
                    key={c.id}
                    onClick={(e) => onRowClick(e, c.id)}
                    className={cn(
                      'cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted/40',
                      isSelected && 'bg-accent/5 hover:bg-accent/10',
                    )}
                  >
                    {canBulkEdit && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => {
                            e.stopPropagation()
                            onRowCheck(index, e.shiftKey)
                          }}
                          onChange={() => {}}
                          className="size-4 cursor-pointer accent-primary"
                          aria-label={`Select ${c.name}`}
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/portal/contacts/${c.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.do_not_call && (
                        <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                          DNC
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                      {formatPhone(c.phone)}
                    </td>
                    <td className="max-w-56 truncate whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {c.email ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {c.niche ? (
                        nicheInactive ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                            title="This niche isn't active on your account — contact the Reactivation Power team to turn it on."
                          >
                            <Lock className="size-3" />
                            {c.niche.name} — not active
                          </span>
                        ) : (
                          <span className="text-foreground">{c.niche.name}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {c.stage ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {c.stage.name}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {c.last_call
                        ? `${DISPOSITION_LABELS[c.last_call.disposition]} · ${fmtDate(c.last_call.created_at)}`
                        : 'Never called'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {c.do_not_call
                        ? '—'
                        : c.next_follow_up
                          ? fmtDate(c.next_follow_up.due_at, true)
                          : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!c.do_not_call &&
                          (nicheInactive ? (
                            <span
                              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-input bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                              title="This niche isn't active on your account — contact the Reactivation Power team to turn it on."
                            >
                              <Lock className="size-3.5" />
                              Call
                            </span>
                          ) : (
                            <Link
                              href={`/portal/dialer/call/${c.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              <Phone className="size-3.5" />
                              Call
                            </Link>
                          ))}
                        <DeleteContactButton
                          contactId={c.id}
                          contactName={c.name}
                          variant="row"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
