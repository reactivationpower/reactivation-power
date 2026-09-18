'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { SERVICE_GROUPS } from '@/lib/service-catalog'

/**
 * Lead-form service picker. Shows the public label from the catalog but
 * submits the internal niche name, so GoHighLevel notes and
 * `landing_leads.services` keep the names existing records already use.
 */
export function ServicesMultiSelect({
  defaultSelected = [],
  error,
  onSelectionChange,
}: {
  /** Internal niche names (what the form submits) */
  defaultSelected?: string[]
  /** Validation message from the form; renders the group in its error state */
  error?: string
  onSelectionChange?: (selected: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected)

  function toggle(niche: string) {
    const next = selected.includes(niche)
      ? selected.filter((s) => s !== niche)
      : [...selected, niche]
    setSelected(next)
    onSelectionChange?.(next)
  }

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-invalid={error ? 'true' : undefined}
      tabIndex={-1}
    >
      <legend className="text-sm font-medium text-foreground">
        What services do you offer?
        <span className="text-destructive" aria-hidden="true">
          {' '}
          *
        </span>
        <span className="sr-only"> (required)</span>{' '}
        <span className="font-normal text-muted-foreground">
          (select all that apply)
        </span>
      </legend>

      {/* Selected values submit with the form */}
      {selected.map((s) => (
        <input key={s} type="hidden" name="services" value={s} />
      ))}

      <div
        className={`flex flex-col gap-4 rounded-md ${
          error ? 'outline outline-2 outline-offset-4 outline-destructive/50' : ''
        }`}
      >
        {SERVICE_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {group.services.map((service) => {
                const checked = selected.includes(service.niche)
                return (
                  <button
                    key={service.niche}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(service.niche)}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                      checked
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-input bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? 'border-accent bg-accent text-accent-foreground'
                          : 'border-input bg-card'
                      }`}
                      aria-hidden="true"
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    {service.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : selected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {selected.length} selected
        </p>
      ) : null}
    </fieldset>
  )
}
