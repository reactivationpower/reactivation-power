import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Resetting one demo practice must only touch that practice's participant
 * family. The Supabase client is a small in-memory stand-in that records
 * which ids every delete was scoped to; nothing here reaches the network.
 */

interface ParticipantRow {
  id: string
  email: string
  parent_id: string | null
  is_demo: boolean
}

const participants: ParticipantRow[] = []
const deletes: { table: string; column: string; ids: string[] }[] = []

function selectBuilder() {
  const filters: ((r: ParticipantRow) => boolean)[] = []
  const b = {
    eq(col: keyof ParticipantRow, v: unknown) {
      filters.push((r) => r[col] === v)
      return b
    },
    maybeSingle: async () => {
      const rows = participants.filter((r) => filters.every((f) => f(r)))
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: (v: { data: ParticipantRow[]; error: null }) => void) {
      resolve({ data: participants.filter((r) => filters.every((f) => f(r))), error: null })
    },
  }
  return b
}

const supabase = {
  from(table: string) {
    return {
      select: () => {
        if (table !== 'participants') throw new Error(`unexpected select on ${table}`)
        return selectBuilder()
      },
      delete: () => ({
        in: async (column: string, ids: string[]) => {
          deletes.push({ table, column, ids })
          return { data: null, error: null }
        },
      }),
    }
  },
}

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => supabase }))
// Lead Follow-Up rows live in drizzle-managed tables; record the wipe's scope
// the same way instead of opening a Postgres pool.
vi.mock('@/lib/lead-followup/store', () => ({
  wipeLeadFollowUpForOwners: async (ids: string[]) => {
    deletes.push({ table: 'lead_campaigns', column: 'owner_id', ids })
  },
}))
vi.mock('@/lib/lead-followup/access', () => ({ setLeadFollowUpAccess: async () => {} }))

const { wipeDemoPractice } = await import('../seed')
const { CHIRO_DEMO, AESTHETICS_DEMO, demoEmail } = await import('../config')

beforeEach(() => {
  participants.length = 0
  deletes.length = 0
  participants.push(
    { id: 'chiro-owner', email: demoEmail(CHIRO_DEMO.owner.email), parent_id: null, is_demo: true },
    { id: 'chiro-sarah', email: demoEmail('sarah.mitchell'), parent_id: 'chiro-owner', is_demo: true },
    { id: 'chiro-tyler', email: demoEmail('tyler.brooks'), parent_id: 'chiro-owner', is_demo: true },
    { id: 'spa-owner', email: demoEmail(AESTHETICS_DEMO.owner.email), parent_id: null, is_demo: true },
    { id: 'spa-jasmine', email: demoEmail('jasmine.okoro'), parent_id: 'spa-owner', is_demo: true },
    // A real customer who happens to have a staffer; must never be swept up.
    { id: 'real-owner', email: 'owner@real-clinic.com', parent_id: null, is_demo: false },
    { id: 'real-staff', email: 'staff@real-clinic.com', parent_id: 'real-owner', is_demo: false },
  )
})

describe('wipeDemoPractice', () => {
  it('resetting the chiro demo deletes only the chiro family\u2019s rows', async () => {
    await wipeDemoPractice(CHIRO_DEMO)
    expect(deletes.map((d) => d.table).sort()).toEqual(
      ['activity_events', 'contacts', 'lead_campaigns', 'service_niche_mappings', 'sessions', 'video_progress'],
    )
    for (const d of deletes) {
      expect([...d.ids].sort()).toEqual(['chiro-owner', 'chiro-sarah', 'chiro-tyler'])
      expect(d.ids).not.toContain('spa-owner')
      expect(d.ids).not.toContain('real-owner')
    }
  })

  it('resetting the aesthetics demo leaves the chiro demo untouched', async () => {
    await wipeDemoPractice(AESTHETICS_DEMO)
    expect(deletes.length).toBeGreaterThan(0)
    for (const d of deletes) {
      expect([...d.ids].sort()).toEqual(['spa-jasmine', 'spa-owner'])
    }
  })

  it('deletes nothing when the practice has never been built', async () => {
    participants.splice(participants.findIndex((p) => p.id === 'spa-owner'), 1)
    participants.splice(participants.findIndex((p) => p.id === 'spa-jasmine'), 1)
    await wipeDemoPractice(AESTHETICS_DEMO)
    expect(deletes).toEqual([])
  })

  it('ignores a non-demo row that somehow carries a demo owner e-mail', async () => {
    participants.find((p) => p.id === 'spa-owner')!.is_demo = false
    await wipeDemoPractice(AESTHETICS_DEMO)
    expect(deletes).toEqual([])
  })
})
