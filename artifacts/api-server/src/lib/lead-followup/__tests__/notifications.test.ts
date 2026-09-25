import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), send: vi.fn(), participant: vi.fn(),
}))
vi.mock('@workspace/db', () => ({
  db: { execute: mocks.execute, transaction: (fn: any) => fn({ execute: mocks.execute }) },
}))
vi.mock('@/lib/mail', () => ({ sendEmail: mocks.send }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/data/participants', () => ({ getCurrentParticipant: mocks.participant }))
vi.mock('@/lib/app-origin', () => ({ appOrigin: () => 'https://example.com' }))
import { deliverLeadEmails, queueLeadEmail, validateLeadEmailSettings, readLeadEmailSettings } from '../notifications'
import { getLeadEmailSettings, saveLeadEmailSettings } from '@/actions/lead-notifications'

const query = (i: number) => new PgDialect().sqlToQuery(mocks.execute.mock.calls[i][0])
beforeEach(() => {
  vi.clearAllMocks()
  mocks.execute.mockResolvedValue({ rows: [] })
  mocks.send.mockResolvedValue({ ok: true, logId: 'log' })
  mocks.participant.mockResolvedValue({ id: 'owner-one', role: 'owner', is_demo: false })
})
describe('office lead email preferences', () => {
  it('defaults off; normalizes one recipient and rejects malformed input', async () => {
    expect(await readLeadEmailSettings('owner-one')).toEqual({ enabled: false, recipient: '' })
    expect(validateLeadEmailSettings({ enabled: true, recipient: ' OFFICE@Example.com ' })).toEqual({ enabled: true, recipient: 'office@example.com' })
    for (const recipient of ['', 'a@b.com,b@b.com', 'a@b.com\nBcc:x@y.com']) {
      expect(validateLeadEmailSettings({ enabled: true, recipient })).toBeNull()
    }
  })
  it('rejects staff, signed-out and demo owners before database access', async () => {
    for (const p of [null, { role: 'staff' }, { role: 'owner', is_demo: true }]) {
      mocks.participant.mockResolvedValue(p)
      expect(await getLeadEmailSettings()).toHaveProperty('error')
      expect(await saveLeadEmailSettings({ enabled: false, recipient: '' })).toHaveProperty('error')
    }
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('ignores client owner IDs and cancels pending alerts on opt-out', async () => {
    await saveLeadEmailSettings({ ownerId: 'other-owner', enabled: false, recipient: '' })
    expect(query(0).params).toContain('owner-one')
    expect(query(0).params).not.toContain('other-owner')
    expect(query(1).sql).toContain("status IN ('pending', 'failed')")
    expect(query(1).params).toContain(true)
  })
  it('returns explicit migration/configuration errors to the settings form', async () => {
    mocks.execute.mockRejectedValue(new Error('database secret'))
    expect(await getLeadEmailSettings()).toEqual({ error: expect.stringContaining('database update') })
  })
})
describe('durable lead notification delivery', () => {
  it('queues within a savepoint, owner-scoped and opt-in only with deduplication', async () => {
    const nested = { execute: mocks.execute }
    const tx = { transaction: vi.fn(fn => fn(nested)) }
    await queueLeadEmail(tx as any, { id: 'lead/one', ownerId: 'owner-one', campaignId: 'campaign-one', count: 1 })
    const q = query(0)
    expect(q.sql).toContain('AND s.enabled')
    expect(q.sql).toContain('NOT coalesce(p.is_demo, false)')
    expect(q.sql).toContain('ON CONFLICT (id) DO NOTHING')
    expect(q.params).toContain('owner-one')
    expect(tx.transaction).toHaveBeenCalledOnce()
  })
  it('does not roll back lead creation when outbox migration is missing', async () => {
    const tx = { transaction: vi.fn().mockRejectedValue(new Error('missing table')) }
    await expect(queueLeadEmail(tx as any, { id: 'one', ownerId: 'owner', campaignId: 'c', count: 1 })).resolves.toBeUndefined()
  })
  it('never sends when opted out or there are no claimed events', async () => {
    await deliverLeadEmails('owner-one')
    expect(mocks.send).not.toHaveBeenCalled()
    const q = query(1)
    expect(q.sql).toContain('s.enabled AND s.recipient = o.recipient')
    expect(q.sql).toContain('SKIP LOCKED')
    expect(q.params).toContain('owner-one')
  })
  it('sends a bulk summary with stable provider idempotency and no lead data', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: 'import/first', owner_id: 'owner-one', recipient: 'office@example.com', campaign_id: 'campaign-one', lead_count: 25,
    }] })
    await deliverLeadEmails('owner-one')
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith('new_leads', 'office@example.com',
      { count: 25, portalUrl: 'https://example.com/portal/campaigns/campaign-one' },
      { idempotencyKey: 'lead-email/import/first', metadata: { notificationId: 'import/first', ownerId: 'owner-one' } })
    expect(query(2).params).toContain('sent')
  })
  it('persists failed delivery for bounded retries without throwing', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: 'one', owner_id: 'owner-one', recipient: 'office@example.com', campaign_id: 'c', lead_count: 1,
    }] })
    mocks.send.mockResolvedValue({ ok: false, error: 'provider secret' })
    await expect(deliverLeadEmails()).resolves.toBeUndefined()
    expect(query(2).params).toContain('failed')
    expect(query(2).params).not.toContain('provider secret')
    expect(query(0).sql).toContain("interval '23 hours'")
    expect(query(1).sql).toContain('attempts < 5')
  })
})