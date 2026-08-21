'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import {
  lookupZip,
  submitHealthcareLead,
  type LeadState,
} from '@/app/actions/leads'
import { ServicesMultiSelect } from '@/components/landing/services-multi-select'
import { Button } from '@/components/ui/button'

const initialState: LeadState = {}

/** Format a raw digit string as (xxx) xxx-xxxx while typing */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
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

  const errors = state.fieldErrors ?? {}
  const v = state.values ?? {}

  // Restore controlled values after a failed submit so nothing resets
  useEffect(() => {
    if (state.values) {
      if (state.values.phone) setPhone(formatPhone(state.values.phone))
      if (state.values.zip) setZip(state.values.zip)
    }
  }, [state.values])

  // Scroll to and focus the first invalid field (mobile especially)
  useEffect(() => {
    if (!state.fieldErrors || !formRef.current) return
    const firstBad = formRef.current.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    )
    if (firstBad) {
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstBad.focus({ preventScroll: true })
    }
  }, [state.fieldErrors])

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
          </label>
          <input
            id={`${uid}-first-name`}
            name="firstName"
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
          </label>
          <input
            id={`${uid}-last-name`}
            name="lastName"
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
        </label>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
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
          </label>
          <input
            id={`${uid}-phone`}
            name="phone"
            type="tel"
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
          </label>
          <input
            id={`${uid}-zip`}
            name="zip"
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
          </label>
          <select
            id={`${uid}-years`}
            name="yearsInPractice"
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
            Estimated inactive patients
          </label>
          <select
            id={`${uid}-inactive`}
            name="inactivePatients"
            defaultValue={v.inactivePatients ?? ''}
            aria-invalid={errors.inactivePatients ? 'true' : undefined}
            className={inputClass(Boolean(errors.inactivePatients))}
          >
            <option value="" disabled>
              Select one
            </option>
            <option value="Under 100">Under 100</option>
            <option value="100-500">100&ndash;500</option>
            <option value="500-1,000">500&ndash;1,000</option>
            <option value="1,000-5,000">1,000&ndash;5,000</option>
            <option value="5,000+">5,000+</option>
            <option value="Not sure">Not sure</option>
          </select>
          {errors.inactivePatients && (
            <p className="text-xs font-medium text-destructive">
              {errors.inactivePatients}
            </p>
          )}
        </div>
      </div>

      <ServicesMultiSelect defaultSelected={state.services ?? []} />

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
            defaultChecked={v.consent === 'on'}
            aria-invalid={errors.consent ? 'true' : undefined}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span className="text-muted-foreground">
            I consent to being contacted by text message and phone call for
            marketing related to Reactivation Power. Message and data rates
            may apply. Reply STOP to opt out at any time.
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
