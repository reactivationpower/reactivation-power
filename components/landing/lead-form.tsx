'use client'

import { useActionState, useId } from 'react'
import { submitHealthcareLead, type LeadState } from '@/app/actions/leads'
import { ServicesMultiSelect } from '@/components/landing/services-multi-select'
import { Button } from '@/components/ui/button'

const initialState: LeadState = {}

export function LeadForm() {
  const [state, formAction, pending] = useActionState(
    submitHealthcareLead,
    initialState,
  )
  // Unique per instance — this form renders twice on the page (popup + inline)
  const uid = useId()

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
            required
            className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
          />
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
            required
            className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
          />
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
          required
          className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
        />
      </div>

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
          autoComplete="tel"
          required
          className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
        />
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
          className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
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
            required
            defaultValue=""
            className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
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
            required
            defaultValue=""
            className="h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
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
        </div>
      </div>

      <ServicesMultiSelect />

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
