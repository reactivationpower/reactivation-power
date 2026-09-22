import { describe, expect, it } from 'vitest'
import {
  PARENT_TOKENS,
  PATIENT_TOKENS,
  PT_TOKEN_KEYS,
  ptTokenKeyMismatches,
} from '@workspace/script-tokens'

// ScriptFlowPlayer swaps PATIENT_TOKENS for PARENT_TOKENS when the trail
// passes a mode_parent step. A pt_ key present in only one table leaves the
// other mode rendering a raw {{pt_...}} slot on the phone.
describe('patient / parent wording tables', () => {
  it('define exactly the same pt_ keys', () => {
    expect(ptTokenKeyMismatches()).toEqual({ patientOnly: [], parentOnly: [] })
    expect(Object.keys(PARENT_TOKENS).sort()).toEqual(Object.keys(PATIENT_TOKENS).sort())
  })

  it('only contain pt_-prefixed keys with non-empty wording', () => {
    for (const table of [PATIENT_TOKENS, PARENT_TOKENS]) {
      for (const [key, value] of Object.entries(table)) {
        expect(key).toMatch(/^pt_[a-z0-9_]+$/)
        expect(value.trim().length, `${key} is blank`).toBeGreaterThan(0)
      }
    }
    expect([...PT_TOKEN_KEYS].sort()).toEqual(Object.keys(PATIENT_TOKENS).sort())
  })
})
