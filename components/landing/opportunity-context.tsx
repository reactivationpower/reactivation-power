'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { INACTIVE_DEFAULT, VALUE_DEFAULT } from '@/lib/opportunity'

export interface OpportunityState {
  inactiveCount: number
  patientValue: number
  setInactiveCount: (n: number) => void
  setPatientValue: (n: number) => void
}

const OpportunityContext = createContext<OpportunityState | null>(null)

/**
 * Holds the hero calculator's two slider values so every lead form on the
 * page (header button, hero buttons, inline form) submits the exact numbers
 * the visitor dialed in — no re-asking, no range buckets.
 */
export function OpportunityProvider({ children }: { children: ReactNode }) {
  const [inactiveCount, setInactiveCount] = useState(INACTIVE_DEFAULT)
  const [patientValue, setPatientValue] = useState(VALUE_DEFAULT)

  return (
    <OpportunityContext.Provider
      value={{ inactiveCount, patientValue, setInactiveCount, setPatientValue }}
    >
      {children}
    </OpportunityContext.Provider>
  )
}

/** Null when the page has no calculator (e.g. /schedule-a-call). */
export function useOpportunity(): OpportunityState | null {
  return useContext(OpportunityContext)
}
