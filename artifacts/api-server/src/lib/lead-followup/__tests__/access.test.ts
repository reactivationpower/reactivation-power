import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Lead Follow-Up product guard. The grant lives on the access owner, so
 * staff inherit it; anyone without it is sent back to the reactivation
 * portal (loaders) or told why (actions). The db is a tiny in-memory stub.
 */

const grants = new Set<string>()
let current: any = null

vi.mock('@workspace/db', () => {
  const chain = (rows: () => unknown[]) => {
    const b: any = {
      from: () => b,
      where: () => b,
      limit: () => Promise.resolve(rows()),
      then: (res: (v: unknown[]) => void) => res(rows()),
    }
    return b
  }
  return {
    productAccessTable: { participantId: 'participant_id', product: 'product' },
    db: {
      select: () => chain(() => (grants.has(String(currentOwner())) ? [{ participantId: currentOwner() }] : [])),
    },
  }
})

// The stub can't read drizzle conditions, so the test tells it which owner
// the query is about.
let queriedOwner: string | null = null
function currentOwner() {
  return queriedOwner
}

vi.mock('@/lib/data/participants', () => ({
  getCurrentParticipant: async () => current,
  accessOwnerId: (p: any) => {
    queriedOwner = p.parent_id ?? p.id
    return queriedOwner
  },
}))

const { requireLeadFollowUp, leadFollowUpContextOrError } = await import('../access')
const { RedirectSignal } = await import('next/navigation')

const owner = { id: 'owner-1', parent_id: null, role: 'owner' }
const staff = { id: 'staff-1', parent_id: 'owner-1', role: 'staff' }

beforeEach(() => {
  grants.clear()
  current = null
  queriedOwner = null
})

describe('requireLeadFollowUp', () => {
  it('sends a signed-out visitor to login with a return path', async () => {
    await expect(requireLeadFollowUp('/portal/campaigns')).rejects.toMatchObject({
      location: '/login?next=%2Fportal%2Fcampaigns',
    })
  })

  it('sends an account without the product back to the reactivation portal', async () => {
    current = owner
    const err = await requireLeadFollowUp().catch((e) => e)
    expect(err).toBeInstanceOf(RedirectSignal)
    expect(err.location).toBe('/portal')
  })

  it('lets a granted owner through', async () => {
    grants.add('owner-1')
    current = owner
    await expect(requireLeadFollowUp()).resolves.toMatchObject({ ownerId: 'owner-1', isOwner: true })
  })

  it('staff inherit the owner grant', async () => {
    grants.add('owner-1')
    current = staff
    await expect(requireLeadFollowUp()).resolves.toMatchObject({ ownerId: 'owner-1', isOwner: false })
  })
})

describe('leadFollowUpContextOrError', () => {
  it('returns an error instead of redirecting', async () => {
    current = owner
    expect(await leadFollowUpContextOrError()).toEqual({
      ok: false,
      error: 'Lead Follow-Up is not turned on for this account.',
    })
    expect(await leadFollowUpContextOrError()).not.toHaveProperty('ctx')
  })

  it('returns the context when granted', async () => {
    grants.add('owner-1')
    current = staff
    const res = await leadFollowUpContextOrError()
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.ctx.ownerId).toBe('owner-1')
  })
})
