'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

/**
 * Healthcare niches offered in the course — keep in sync with the niches
 * table, listed in the same sort_order the user portal displays them.
 */
const HEALTHCARE_SERVICES = [
  'Chiropractic',
  'ChiroThin',
  'Weight Loss (Not ChiroThin)',
  'Red Light / Body Contouring',
  'Decompression',
  'Neuropathy',
  'Softwave/Acoustic Wave Therapy',
  'Joint Pain',
  'Gut Health',
  'Massage Therapy',
  'Acupuncture',
  'Botox',
  'Teeth Whitening',
  'Cellulite Reduction',
  'Skin Tightening',
  'Clear Aligners',
  'Orthodontics / Braces',
  'Body Waxing',
  'Laser Hair Removal',
  'GLP Patients',
  'Dental Implants',
  'Med Spa',
] as const

export function ServicesMultiSelect({
  defaultSelected = [],
  error,
  onSelectionChange,
}: {
  defaultSelected?: string[]
  /** Validation message from the form; renders the group in its error state */
  error?: string
  onSelectionChange?: (selected: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected)

  function toggle(service: string) {
    const next = selected.includes(service)
      ? selected.filter((s) => s !== service)
      : [...selected, service]
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
        className={`grid grid-cols-1 gap-1.5 rounded-md sm:grid-cols-2 ${
          error ? 'outline outline-2 outline-offset-4 outline-destructive/50' : ''
        }`}
      >
        {HEALTHCARE_SERVICES.map((service) => {
          const checked = selected.includes(service)
          return (
            <button
              key={service}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(service)}
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
              {service}
            </button>
          )
        })}
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
