import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog/concern-options'
import {
  AESTHETICS_DEMO,
  CHIRO_DEMO,
  DEMO_PRACTICES,
  demoConfigProblems,
  demoPracticeByOwnerEmail,
  demoPracticeProblems,
  demoEmail,
  type DemoPractice,
} from '../config'
import { AESTHETIC_SERVICE_NAMED_NICHES, DEMO_PRACTICE_COPY } from '../practice-copy'
import { DEMO_SAMPLE_CSVS } from '../sample-csv'

/**
 * The rules the seeder leans on for BOTH demo practices: every showcase
 * patient fits in the first batch, identities never collide, and the med
 * spa's data is written in med-spa words.
 */
describe('demo practice config', () => {
  it('ships two practices, chiro and aesthetics, with no problems', () => {
    expect(DEMO_PRACTICES.map((p) => p.key)).toEqual(['chiro', 'aesthetics'])
    expect(demoConfigProblems()).toEqual([])
  })

  it('keeps the chiro identities sales already knows', () => {
    expect(CHIRO_DEMO.owner.email).toBe('dr.whitaker')
    expect(CHIRO_DEMO.owner.practice).toBe('Ridgeline Chiropractic & Wellness')
    expect(CHIRO_DEMO.callers.map((c) => c.email)).toEqual([
      'sarah.mitchell', 'marcus.reyes', 'priya.nair', 'tyler.brooks',
    ])
    expect(CHIRO_DEMO.rngSeed).toBe('ridgeline-chiro-demo-v1')
  })

  it('shares red light for both lead demos but keeps cellulite reduction aesthetics-only', () => {
    expect(CHIRO_DEMO.niches).toEqual([
      'Chiropractic', 'Decompression', 'Joint Pain', 'Neuropathy', 'Acupuncture',
      'Massage Therapy', 'Acoustic Wave Therapy', 'Red Light / Body Contouring', 'Gut Health', 'ChiroThin',
      'Weight Loss (Not ChiroThin)', 'GLP Patients',
    ])
    expect(AESTHETICS_DEMO.niches).toEqual([
      'Botox', 'Fillers', 'IPL / Photofacial', 'Microneedling / RF Microneedling',
      'Laser Resurfacing', 'Acne / Acne Scarring', 'Pigmentation / Sun Damage',
      'Rosacea / Redness', 'Chemical Peels', 'Facials / HydraFacial',
      'Medical-Grade Skincare', 'Skin Tightening', 'Cellulite Reduction',
      'Red Light / Body Contouring', 'Laser Hair Removal', 'Body Waxing',
    ])
    expect(CHIRO_DEMO.niches).toContain('Red Light / Body Contouring')
    expect(CHIRO_DEMO.niches).not.toContain('Cellulite Reduction')
    expect(CHIRO_DEMO.showcaseNiches).not.toContain('Cellulite Reduction')
  })

  it('every aesthetics niche has a showcase patient and they all fit the batch', () => {
    expect([...AESTHETICS_DEMO.showcaseNiches].sort()).toEqual([...AESTHETICS_DEMO.niches].sort())
    expect(AESTHETICS_DEMO.showcaseNiches.length).toBeLessThanOrEqual(AESTHETICS_DEMO.callBatchSize)
  })

  it('the showcase-fits-the-batch guard still fires for either practice', () => {
    const tooMany: DemoPractice = { ...CHIRO_DEMO, callBatchSize: CHIRO_DEMO.showcaseNiches.length - 1 }
    expect(demoPracticeProblems(tooMany).join(' ')).toMatch(/showcase niches but the batch size/)
    const spa: DemoPractice = { ...AESTHETICS_DEMO, callBatchSize: 10 }
    expect(demoPracticeProblems(spa).join(' ')).toMatch(/16 showcase niches but the batch size is 10/)
  })

  it('refuses a showcase or default niche the account does not have', () => {
    const bad: DemoPractice = { ...CHIRO_DEMO, showcaseNiches: [...CHIRO_DEMO.showcaseNiches, 'Botox'] }
    expect(demoPracticeProblems(bad).join(' ')).toMatch(/showcase niche "Botox" is not an enabled niche/)
    const badDefault: DemoPractice = { ...AESTHETICS_DEMO, defaultNiche: 'Chiropractic' }
    expect(demoPracticeProblems(badDefault).join(' ')).toMatch(/defaultNiche "Chiropractic"/)
  })

  it('refuses two practices that share a demo identity', () => {
    const clash: DemoPractice = { ...AESTHETICS_DEMO, owner: { ...AESTHETICS_DEMO.owner, email: CHIRO_DEMO.owner.email } }
    expect(demoConfigProblems([CHIRO_DEMO, clash]).join(' ')).toMatch(/dr\.whitaker.*used by both chiro and aesthetics/)
  })

  it('resolves a practice from its owner e-mail and nothing else', () => {
    expect(demoPracticeByOwnerEmail(demoEmail('dr.whitaker'))?.key).toBe('chiro')
    expect(demoPracticeByOwnerEmail(demoEmail('DR.MARSH'))?.key).toBe('aesthetics')
    expect(demoPracticeByOwnerEmail(demoEmail('sarah.mitchell'))).toBeNull()
    expect(demoPracticeByOwnerEmail('someone@real-clinic.com')).toBeNull()
    expect(demoPracticeByOwnerEmail(null)).toBeNull()
  })

  it('both owners carry a last name so scripts can say "Dr. <last>"', () => {
    for (const p of DEMO_PRACTICES) expect(p.owner.last.trim().length).toBeGreaterThan(1)
  })

  it('the web app carries an identical copy of the config', () => {
    const here = resolve(__dirname, '../config.ts')
    const web = resolve(__dirname, '../../../../../reactivation-power/src/lib/demo/config.ts')
    const strip = (s: string) => s.replace(/^\/\/ @ts-nocheck\r?\n\r?\n?/, '').replace(/\r\n/g, '\n')
    expect(strip(readFileSync(web, 'utf8'))).toBe(strip(readFileSync(here, 'utf8')))
  })
})

describe('demo practice copy', () => {
  it('has complaints and service labels for every niche of both practices', () => {
    for (const p of DEMO_PRACTICES) {
      const copy = DEMO_PRACTICE_COPY[p.key]
      for (const n of p.niches) {
        expect(copy.complaints[n]?.length, `${p.key} complaints for ${n}`).toBeGreaterThan(0)
        expect(copy.serviceLabels[n]?.length, `${p.key} service labels for ${n}`).toBeGreaterThan(0)
      }
    }
  })

  it("aesthetics complaints are that niche's concern-option chips, never a flare-up", () => {
    const copy = DEMO_PRACTICE_COPY.aesthetics
    const serviceNamed = new Set<string>(AESTHETIC_SERVICE_NAMED_NICHES)
    for (const n of AESTHETICS_DEMO.niches) {
      for (const complaint of copy.complaints[n]) {
        expect(complaint.toLowerCase()).not.toContain('flare')
        if (serviceNamed.has(n)) continue
        const labels = CONCERN_OPTIONS[n].map((o) => o.label)
        expect(labels, `${n}: "${complaint}"`).toContain(complaint)
      }
    }
  })

  it('notes name each practice\u2019s own provider, not the other one\u2019s', () => {
    const all = (key: 'chiro' | 'aesthetics') => {
      const c = DEMO_PRACTICE_COPY[key]
      return [
        ...c.notesReceptive, ...c.notesNeutral, ...c.notesCold, ...c.notesNeverReached,
        ...c.bookedNotes, ...c.callbackNotes, ...c.noScheduleNotes,
      ].join('\n')
    }
    expect(all('chiro')).toContain('Dr. Whitaker')
    expect(all('chiro')).not.toContain('Dr. Marsh')
    expect(all('aesthetics')).toContain('Dr. Marsh')
    expect(all('aesthetics')).not.toContain('Dr. Whitaker')
    // Med-spa notes must not read like a chiropractor's.
    expect(all('aesthetics').toLowerCase()).not.toMatch(/\b(knee|sciatica|adjustment|insurance|chiro)/)
  })

  it('the last cold note is the DNC note (the seeder slices it off for spoke-no-schedule)', () => {
    for (const p of DEMO_PRACTICES) {
      const cold = DEMO_PRACTICE_COPY[p.key].notesCold
      expect(cold[cold.length - 1]).toMatch(/DNC/)
    }
  })
})

describe('demo sample CSVs', () => {
  it('each practice has a 24-row export using its own niches plus two rows of a niche it lacks', () => {
    for (const p of DEMO_PRACTICES) {
      const { csv } = DEMO_SAMPLE_CSVS[p.key]
      const rows = csv.trim().split('\n').slice(1).map((r) => r.split(','))
      expect(rows).toHaveLength(24)
      const enabled = new Set(p.niches)
      const foreign = rows.filter((r) => !enabled.has(r[5]))
      expect(foreign, `${p.key} rows tagged with a niche the account lacks`).toHaveLength(2)
      const seeded = new Set(p.patientNames.map(([f, l]) => `${f} ${l}`))
      for (const r of rows) expect(seeded.has(`${r[2]} ${r[1]}`), `${r[2]} ${r[1]} is a seeded patient`).toBe(false)
    }
  })
})
