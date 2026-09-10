'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import {
  lookupZip,
  submitHealthcareLead,
  type LeadState,
} from '@/app/actions/leads'
import { useOpportunity } from '@/components/landing/opportunity-context'
import { ServicesMultiSelect } from '@/components/landing/services-multi-select'
import { Button } from '@/components/ui/button'
import { readLeadFields, validateLeadFields } from '@/lib/lead-validation'

const initialState: LeadState = {}

/** Red asterisk for sighted users; the input's `required` attr covers AT. */
function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {' '}
      *
    </span>
  )
}

/** Format a raw digit string as (xxx) xxx-xxxx while typing */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Show a digit string with thousands separators ("1800" -> "1,800") */
function formatCount(digits: string): string {
  return digits ? Number(digits).toLocaleString('en-US') : ''
}

const inputBase =
  'h-11 rounded-md border bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30'

function inputClass(hasError: boolean): string {
  return `${inputBase} ${hasError ? 'border-destructive ring-2 ring-destructive/20' : 'border-input'}`
}

export function LeadForm() {
  const [state, formAction, pending] = useActionState(
    submitHealthcareLead,
    initialState,
  )
  // Unique per instance — this form renders twice on the page (popup + inline)
  const uid = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const [phone, setPhone] = useState('')
  const [zip, setZip] = useState('')
  const [zipPlace, setZipPlace] = useState<{
    city: string
    state: string
  } | null>(null)

  // Slider values from the hero calculator, when this page has one
  const calc = useOpportunity()
  const [inactive, setInactive] = useState(() =>
    calc ? String(calc.inactiveCount) : '',
  )
  // Set once the visitor types in the count field — even retyping the same
  // number counts, because they've now confirmed it
  const [inactiveEdited, setInactiveEdited] = useState(false)
  // Follow the slider if the visitor moves it after this form has mounted
  const sliderCount = calc?.inactiveCount
  useEffect(() => {
    if (sliderCount !== undefined) setInactive(String(sliderCount))
  }, [sliderCount])

  // Errors shown to the visitor. Seeded by the instant client check on submit;
  // replaced by the server's verdict if the server disagrees.
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Bumped every time a fresh batch of errors lands so we scroll to the first.
  const [errorRound, setErrorRound] = useState(0)
  const v = state.values ?? {}

  // Restore controlled values after a failed submit so nothing resets
  useEffect(() => {
    if (state.values) {
      if (state.values.phone) setPhone(formatPhone(state.values.phone))
      if (state.values.zip) setZip(state.values.zip)
      if (state.values.inactivePatients)
        setInactive(state.values.inactivePatients)
    }
  }, [state.values])

  useEffect(() => {
    if (!state.fieldErrors) return
    setErrors(state.fieldErrors)
    setErrorRound((n) => n + 1)
  }, [state.fieldErrors])

  // Scroll to and focus the first invalid field (mobile especially)
  useEffect(() => {
    if (errorRound === 0 || !formRef.current) return
    const firstBad = formRef.current.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    )
    if (firstBad) {
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstBad.focus({ preventScroll: true })
    }
  }, [errorRound])

  // Check every rule before the request leaves the browser. Returning early
  // with preventDefault stops React from running the server action.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const found = validateLeadFields(readLeadFields(new FormData(e.currentTarget)))
    if (Object.keys(found).length > 0) {
      e.preventDefault()
      setErrors(found)
      setErrorRound((n) => n + 1)
      return
    }
    setErrors({})
  }

  // Drop a field's error as soon as the visitor starts fixing it
  function clearError(name: string) {
    if (!name || !(name in errors)) return
    setErrors((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  // Auto-populate city/state once the zip has 5 digits
  useEffect(() => {
    const clean = zip.replace(/\D/g, '')
    if (clean.length !== 5) {
      setZipPlace(null)
      return
    }
    let cancelled = false
    void lookupZip(clean).then((place) => {
      if (!cancelled) setZipPlace(place)
    })
    return () => {
      cancelled = true
    }
  }, [zip])

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      onInput={(e) => clearError((e.target as HTMLInputElement).name)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-first-name`}
            className="text-sm font-medium text-foreground"
          >
            First name
            <RequiredMark />
          </label>
          <input
            id={`${uid}-first-name`}
            name="firstName"
            required
            autoComplete="given-name"
            defaultValue={v.firstName ?? ''}
            aria-invalid={errors.firstName ? 'true' : undefined}
            className={inputClass(Boolean(errors.firstName))}
          />
          {errors.firstName && (
            <p className="text-xs font-medium text-destructive">
              {errors.firstName}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-last-name`}
            className="text-sm font-medium text-foreground"
          >
            Last name
            <RequiredMark />
          </label>
          <input
            id={`${uid}-last-name`}
            name="lastName"
            required
            autoComplete="family-name"
            defaultValue={v.lastName ?? ''}
            aria-invalid={errors.lastName ? 'true' : undefined}
            className={inputClass(Boolean(errors.lastName))}
          />
          {errors.lastName && (
            <p className="text-xs font-medium text-destructive">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${uid}-email`}
          className="text-sm font-medium text-foreground"
        >
          Email address
          <RequiredMark />
        </label>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={v.email ?? ''}
          aria-invalid={errors.email ? 'true' : undefined}
          className={inputClass(Boolean(errors.email))}
        />
        {errors.email && (
          <p className="text-xs font-medium text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-phone`}
            className="text-sm font-medium text-foreground"
          >
            Phone number
            <RequiredMark />
          </label>
          <input
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            required
            inputMode="numeric"
            autoComplete="tel"
            placeholder="(555) 555-1234"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            maxLength={14}
            aria-invalid={errors.phone ? 'true' : undefined}
            className={inputClass(Boolean(errors.phone))}
          />
          {errors.phone && (
            <p className="text-xs font-medium text-destructive">
              {errors.phone}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-zip`}
            className="text-sm font-medium text-foreground"
          >
            Zip code
            <RequiredMark />
          </label>
          <input
            id={`${uid}-zip`}
            name="zip"
            required
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="12345"
            value={zip}
            onChange={(e) =>
              setZip(e.target.value.replace(/\D/g, '').slice(0, 5))
            }
            maxLength={5}
            aria-invalid={errors.zip ? 'true' : undefined}
            className={inputClass(Boolean(errors.zip))}
          />
          {zipPlace && (
            <p className="text-xs text-muted-foreground">
              {zipPlace.city}, {zipPlace.state}
            </p>
          )}
          {errors.zip && (
            <p className="text-xs font-medium text-destructive">{errors.zip}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${uid}-practice`}
          className="text-sm font-medium text-foreground"
        >
          Practice name{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={`${uid}-practice`}
          name="practiceName"
          autoComplete="organization"
          defaultValue={v.practiceName ?? ''}
          className={inputClass(false)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-years`}
            className="text-sm font-medium text-foreground"
          >
            How long in practice?
            <RequiredMark />
          </label>
          <select
            id={`${uid}-years`}
            name="yearsInPractice"
            required
            defaultValue={v.yearsInPractice ?? ''}
            aria-invalid={errors.yearsInPractice ? 'true' : undefined}
            className={inputClass(Boolean(errors.yearsInPractice))}
          >
            <option value="" disabled>
              Select one
            </option>
            <option value="Less than 1 year">Less than 1 year</option>
            <option value="1-3 years">1&ndash;3 years</option>
            <option value="4-7 years">4&ndash;7 years</option>
            <option value="8-15 years">8&ndash;15 years</option>
            <option value="16+ years">16+ years</option>
          </select>
          {errors.yearsInPractice && (
            <p className="text-xs font-medium text-destructive">
              {errors.yearsInPractice}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-inactive`}
            className="text-sm font-medium text-foreground"
          >
            Inactive patient files
            <RequiredMark />
          </label>
          <input
            id={`${uid}-inactive`}
            name="inactivePatients"
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 1,000"
            value={formatCount(inactive)}
            onChange={(e) => {
              setInactive(e.target.value.replace(/\D/g, '').slice(0, 6))
              setInactiveEdited(true)
            }}
            aria-invalid={errors.inactivePatients ? 'true' : undefined}
            className={inputClass(Boolean(errors.inactivePatients))}
          />
          {errors.inactivePatients ? (
            <p className="text-xs font-medium text-destructive">
              {errors.inactivePatients}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {calc
                ? 'Carried over from your calculator — edit if needed.'
                : 'Your best estimate is fine.'}
            </p>
          )}
        </div>
      </div>

      {calc ? (
        <>
          <input type="hidden" name="patientValue" value={calc.patientValue} />
          <input
            type="hidden"
            name="inactiveAdjusted"
            value={calc.inactiveTouched || inactiveEdited ? 'yes' : 'no'}
          />
          <input
            type="hidden"
            name="valueAdjusted"
            value={calc.valueTouched ? 'yes' : 'no'}
          />
        </>
      ) : null}

      <ServicesMultiSelect
        defaultSelected={state.services ?? []}
        error={errors.services}
        onSelectionChange={() => clearError('services')}
      />

      <div className="flex flex-col gap-1.5">
        <label
          className={`flex items-start gap-2.5 rounded-md border px-3 py-3 text-sm leading-relaxed ${
            errors.consent
              ? 'border-destructive bg-destructive/5'
              : 'border-input bg-card'
          }`}
        >
          <input
            type="checkbox"
            name="consent"
            required
            defaultChecked={v.consent === 'on'}
            aria-invalid={errors.consent ? 'true' : undefined}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span className="text-muted-foreground">
            I consent to being contacted by text message and phone call for
            marketing related to Reactivation Power. Message and data rates
            may apply. Reply STOP to opt out at any time.
            <RequiredMark />
          </span>
        </label>
        {errors.consent && (
          <p className="text-xs font-medium text-destructive">
            {errors.consent}
          </p>
        )}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-12 bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90"
      >
        {pending ? 'Submitting…' : 'Get My Free Strategy Call'}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Your information is never sold or shared. After submitting, you&apos;ll
        pick a time for your call on the next page.
      </p>
    </form>
  )
}
