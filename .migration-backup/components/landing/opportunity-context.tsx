'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { INACTIVE_DEFAULT, VALUE_DEFAULT } from '@/lib/opportunity'

export interface OpportunityState {
  inactiveCount: number
  patientValue: number
  /** True once the visitor has moved the inactive-files slider at all */
  inactiveTouched: boolean
  /** True once the visitor has moved the patient-value slider at all */
  valueTouched: boolean
  setInactiveCount: (n: number) => void
  setPatientValue: (n: number) => void
}

const OpportunityContext = createContext<OpportunityState | null>(null)

/**
 * Holds the hero calculator's two slider values so every lead form on the
 * page (header button, hero buttons, inline form) submits the exact numbers
 * the visitor dialed in — no re-asking, no range buckets. Also remembers
 * whether each slider was ever moved so the CRM note can flag an untouched
 * default, which otherwise looks identical to a real answer.
 */
export function OpportunityProvider({ children }: { children: ReactNode }) {
  const [inactiveCount, setInactive] = useState(INACTIVE_DEFAULT)
  const [patientValue, setValue] = useState(VALUE_DEFAULT)
  const [inactiveTouched, setInactiveTouched] = useState(false)
  const [valueTouched, setValueTouched] = useState(false)

  const setInactiveCount = useCallback((n: number) => {
    setInactive(n)
    setInactiveTouched(true)
  }, [])

  const setPatientValue = useCallback((n: number) => {
    setValue(n)
    setValueTouched(true)
  }, [])

  return (
    <OpportunityContext.Provider
      value={{
        inactiveCount,
        patientValue,
        inactiveTouched,
        valueTouched,
        setInactiveCount,
        setPatientValue,
      }}
    >
      {children}
    </OpportunityContext.Provider>
  )
}

/** Null when the page has no calculator (e.g. /schedule-a-call). */
export function useOpportunity(): OpportunityState | null {
  return useContext(OpportunityContext)
}
