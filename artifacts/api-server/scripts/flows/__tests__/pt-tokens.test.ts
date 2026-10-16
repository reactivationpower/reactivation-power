import { describe, expect, it } from 'vitest'
import { PT_TOKEN_KEYS, ptTokenKeyMismatches } from '@workspace/script-tokens'
import { KNOWN_TOKENS, listSlugs, readFlowFile, tokensIn } from '../lib.ts'

// Every {{pt_*}} slot in the published flow files (content/flows/*.json, the
// linted source of what is on the phones) must be one the player's wording
// tables define, otherwise a caller sees the raw placeholder.
describe('pt_ tokens in published script flows', () => {
  const defined = new Set(PT_TOKEN_KEYS)

  it('the shared wording tables agree with each other', () => {
    expect(ptTokenKeyMismatches()).toEqual({ patientOnly: [], parentOnly: [] })
  })

  it('apply/lint accept exactly the pt_ tokens the player can fill', () => {
    const knownPt = [...KNOWN_TOKENS].filter((t) => t.startsWith('pt_')).sort()
    expect(knownPt).toEqual([...defined].sort())
  })

  it('reference no pt_ token missing from the wording tables', () => {
    const unknown: string[] = []
    let seen = 0
    for (const slug of listSlugs()) {
      const file = readFlowFile(slug)
      const texts: Array<[string, string]> = [
        ...file.steps.map((s): [string, string] => [`${slug}/${s.step_key}`, `${s.title}\n${s.content}`]),
        ...file.choices.map((c): [string, string] => [
          `${slug}/${c.from_step_key} -> ${c.to_step_key}`,
          c.label,
        ]),
      ]
      for (const [where, text] of texts) {
        for (const token of tokensIn(text)) {
          if (!token.startsWith('pt_')) continue
          seen += 1
          if (!defined.has(token)) unknown.push(`${where}: {{${token}}}`)
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
    expect(unknown).toEqual([])
  })
})
