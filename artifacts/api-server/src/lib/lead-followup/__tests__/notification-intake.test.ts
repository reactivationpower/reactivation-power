import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  queue: vi.fn(), deliver: vi.fn(), returning: vi.fn(), where: vi.fn(), tx: {} as any,
}))
vi.mock('../notifications', () => ({ queueLeadEmail: mocks.queue, deliverLeadEmails: mocks.deliver }))
vi.mock('../../patient-texting/live', () => ({ routeNewTextLead: vi.fn() }))
vi.mock('@workspace/db', async () => {
  const actual = await vi.importActual<any>('@workspace/db')
  const builder: any = {}
  for (const name of ['insert', 'values', 'onConflictDoNothing', 'onConflictDoUpdate']) builder[name] = () => builder
  builder.returning = mocks.returning
  mocks.tx = builder
  return { ...actual, db: {
    transaction: (fn: any) => fn(builder),
    select: () => ({ from: () => ({ where: mocks.where }) }),
  } }
})
import { importLeads, upsertWebhookLead } from '../store'
const campaign = { id: 'campaign-a', ownerId: 'owner-a' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.where.mockResolvedValue([])
  mocks.queue.mockResolvedValue(undefined)
  mocks.deliver.mockResolvedValue(undefined)
})
describe('notification intake decisions', () => {
  const webhook = { campaign, lead: { firstName: 'Private', lastName: 'Name', phone: '3035550123', email: '', requestedTime: '', message: 'private' }, phoneKey: '3035550123', source: 'webhook' as const }
  it('queues only a genuinely new webhook row without copying contact data', async () => {
    mocks.returning.mockResolvedValue([{ id: 'lead-a', inserted: true }])
    await upsertWebhookLead(webhook)
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(mocks.tx, { id: 'lead/lead-a', ownerId: 'owner-a', campaignId: 'campaign-a', count: 1 })
  })
  it('does not enqueue duplicate submissions or test webhooks', async () => {
    mocks.returning.mockResolvedValueOnce([{ id: 'lead-a', inserted: false }])
    await upsertWebhookLead(webhook)
    mocks.returning.mockResolvedValueOnce([{ id: 'lead-test', inserted: true }])
    await upsertWebhookLead({ ...webhook, suppressNotification: true })
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })
  it('queues one summary for actual inserted rows, excluding conflicting rows', async () => {
    mocks.returning.mockResolvedValue([{ id: 'first' }, { id: 'second' }])
    const result = await importLeads({ campaign, source: 'upload', createdBy: 'owner-a', rows: [
      { firstName: 'A', lastName: '', phone: '3035550101' },
      { firstName: 'B', lastName: '', phone: '3035550102' },
      { firstName: 'C', lastName: '', phone: '3035550103' },
    ] })
    expect(result.imported).toBe(2)
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(mocks.tx, { id: 'import/first', ownerId: 'owner-a', campaignId: 'campaign-a', count: 2 })
  })
  it('does not alert for an import with no new rows', async () => {
    mocks.returning.mockResolvedValue([])
    await importLeads({ campaign, source: 'upload', createdBy: 'owner-a', rows: [] })
    expect(mocks.queue).not.toHaveBeenCalled()
  })
})