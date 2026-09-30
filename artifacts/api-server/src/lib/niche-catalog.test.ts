import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONCERN_OPTIONS,
  SERVICE_GROUPS,
  displayNicheName,
  matchNicheByName,
  suggestNicheForService,
} from '@workspace/niche-catalog'
import { extractSlots, formatPhone } from '@workspace/shared'

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
const NICHE_CATALOG_MODULES = [
  'concern-options',
  'niche-match',
  'service-catalog',
]
/**
 * The same happened to a dozen more helpers (script-merge had drifted by ~60
 * lines); they now live once in `@workspace/shared`. Every export of that
 * package must be listed here so a re-copied file fails the suite.
 */
const SHARED_MODULES = [
  'analytics-types',
  'call-time',
  'campaign-tokens',
  'email-templates',
  'format',
  'lazy-time',
  'lead-followup',
  'lead-requested-time',
  'lead-webhooks',
  'lead-validation',
  'notes-text',
  'opportunity',
  'phone',
  'script-merge',
  'types',
  'us-timezones',
]
/**
 * notes-html depends on sanitize-html and is only used when the server stores
 * a note, so it deliberately stays in the api-server; the web app must not
 * grow a copy again (its old one was dead code).
 */
const SERVER_ONLY_MODULES = ['notes-html']
const API_SERVER_LIB = 'artifacts/api-server/src/lib'
const WEB_LIB = 'artifacts/reactivation-power/src/lib'
const ARTIFACT_LIB_DIRS = [API_SERVER_LIB, WEB_LIB]

const sharedPackageExports = JSON.parse(
  readFileSync(path.join(workspaceRoot, 'lib/shared/package.json'), 'utf8'),
).exports as Record<string, string>

describe('@workspace/niche-catalog is the only copy', () => {
  for (const dir of ARTIFACT_LIB_DIRS) {
    for (const mod of NICHE_CATALOG_MODULES) {
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

  it('maps the acoustic-wave canonical niche to its display label without changing its key', () => {
    const canonicalNiche = 'Acoustic Wave Therapy'
    const niche = { id: 'acoustic-id', name: canonicalNiche }
    expect(displayNicheName(canonicalNiche)).toBe('SoftWave/shock wave')
    expect(SERVICE_GROUPS.flatMap((group) => group.services).find(
      (service) => service.label === 'SoftWave/shock wave',
    )?.niche).toBe(canonicalNiche)
    expect(matchNicheByName('SoftWave/shock wave', [niche])).toBe(niche)
    expect(displayNicheName('Chiropractic')).toBe('Chiropractic')
  })
})

describe('@workspace/shared is the only copy', () => {
  for (const dir of ARTIFACT_LIB_DIRS) {
    for (const mod of SHARED_MODULES) {
      it(`${dir}/${mod}.ts does not exist`, () => {
        expect(existsSync(path.join(workspaceRoot, dir, `${mod}.ts`))).toBe(
          false,
        )
      })
    }
  }

  for (const mod of SERVER_ONLY_MODULES) {
    it(`${WEB_LIB}/${mod}.ts does not exist (server-only helper)`, () => {
      expect(existsSync(path.join(workspaceRoot, WEB_LIB, `${mod}.ts`))).toBe(
        false,
      )
    })
    it(`${API_SERVER_LIB}/${mod}.ts still exists`, () => {
      expect(
        existsSync(path.join(workspaceRoot, API_SERVER_LIB, `${mod}.ts`)),
      ).toBe(true)
    })
  }

  it('lists every module the package exports', () => {
    const exported = Object.keys(sharedPackageExports)
      .filter((key) => key !== '.')
      .map((key) => key.replace(/^\.\//, ''))
      .sort()
    expect(exported).toEqual([...SHARED_MODULES].sort())
    for (const mod of SHARED_MODULES) {
      expect(
        existsSync(path.join(workspaceRoot, 'lib/shared/src', `${mod}.ts`)),
      ).toBe(true)
    }
  })

  it('exports the shared helpers', () => {
    expect(formatPhone('5551234567')).toContain('555')
    expect(extractSlots('Hi {{first_name}}, about {{complaint_reference}}')).toEqual([
      'first_name',
      'complaint_reference',
    ])
  })
})
