'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * Healthcare niches offered in the course — keep in sync with the niches
 * table, listed in the same sort_order the user portal displays them.
 */
const HEALTHCARE_SERVICES = [
  'Chiropractic',
  'ChiroThin',
  'Red Light / Body Contouring',
  'Decompression',
  'Neuropathy',
  'Acoustic Wave Therapy',
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

export function ServicesMultiSelect() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const uid = useId()

  // Close when clicking outside the dropdown
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle(service: string) {
    setSelected((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service],
    )
  }

  const summary =
    selected.length === 0
      ? 'Select all that apply'
      : selected.length <= 2
        ? selected.join(', ')
        : `${selected.length} services selected`

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <label
        htmlFor={`${uid}-services`}
        className="text-sm font-medium text-foreground"
      >
        What services do you offer?
      </label>

      {/* Selected values submit with the form */}
      {selected.map((s) => (
        <input key={s} type="hidden" name="services" value={s} />
      ))}

      <button
        id={`${uid}-services`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center justify-between rounded-md border border-input bg-card px-3 text-base outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
      >
        <span
          className={
            selected.length === 0
              ? 'truncate text-muted-foreground'
              : 'truncate text-foreground'
          }
        >
          {summary}
        </span>
        <ChevronDown
          className={`ml-2 size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <ul
            role="listbox"
            aria-multiselectable="true"
            aria-label="Services you offer"
            className="max-h-52 overflow-y-auto p-1"
          >
            {HEALTHCARE_SERVICES.map((service) => {
              const checked = selected.includes(service)
              return (
                <li key={service} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onClick={() => toggle(service)}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
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
                </li>
              )
            })}
          </ul>
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 w-full rounded-md bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              {selected.length > 0
                ? `Done — ${selected.length} selected`
                : 'Done'}
            </button>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} selected
        </p>
      )}
    </div>
  )
}
