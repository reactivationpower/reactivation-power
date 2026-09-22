import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONCERN_OPTIONS,
  SERVICE_GROUPS,
  matchNicheByName,
  suggestNicheForService,
} from '@workspace/niche-catalog'

/**
 * The niche chip / matcher / catalog lists used to be copied by hand into
 * both artifacts and drifted apart (the api-server copy lagged the web copy
 * by whole niches). They now live once in `@workspace/niche-catalog`; this
 * test fails if anyone reintroduces a per-artifact copy.
 */
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)
const SHARED_MODULES = ['concern-options', 'niche-match', 'service-catalog']
const ARTIFACT_LIB_DIRS = [
  'artifacts/api-server/src/lib',
  'artifacts/reactivation-power/src/lib',
]

describe('@workspace/niche-catalog is the only copy', () => {
  for (const dir of ARTIFACT_LIB_DIRS) {
    for (const mod of SHARED_MODULES) {
      it(`${dir}/${mod}.ts does not exist`, () => {
        expect(existsSync(path.join(workspaceRoot, dir, `${mod}.ts`))).toBe(
          false,
        )
      })
    }
  }

  it('exports the shared lists', () => {
    expect(Object.keys(CONCERN_OPTIONS).length).toBeGreaterThan(0)
    expect(SERVICE_GROUPS.length).toBeGreaterThan(0)
  })

  it('matchers accept any record with a name and return it unchanged', () => {
    const niches = [
      { id: 'a', name: 'Chiropractic' },
      { id: 'b', name: 'Clear Aligners' },
    ]
    expect(matchNicheByName('clear-aligners', niches)?.id).toBe('b')
    expect(suggestNicheForService('Invisalign consult', niches)?.id).toBe('b')
    expect(suggestNicheForService('zzz unknown', niches)).toBeNull()
  })
})
