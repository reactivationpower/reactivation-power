import { beforeEach, describe, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ query: vi.fn(), refresh: vi.fn(), history: vi.fn(), admin: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { query: f.query } }))
vi.mock('../auth/admin-session', () => ({ requireAdmin: f.admin }))
vi.mock('./store', () => ({ inboxSettings: async () => ({ sms_ready: false }), SALES_REPLY_TO: 'reply@example.invalid' }))
vi.mock('../sales-leads/provider', () => ({
  contactUrl: (id: string) => id ? `https://app.gohighlevel.com/contacts/${id}` : null,
  contact: vi.fn(), conversations: vi.fn(), provider: vi.fn(), smsSender: vi.fn(), SalesProviderError: class extends Error {},
}))
vi.mock('../sales-leads/ingestion', () => ({ refreshLeadMessages: f.refresh }))
vi.mock('../data/admin-users', () => ({ getAdminUserById: vi.fn() }))
vi.mock('../sales-leads/store', () => ({ stop: vi.fn(), transaction: vi.fn() }))
vi.mock('../appointment-messages/history', () => ({ listAppointmentEmailHistory: f.history }))
import { getConversation } from '../../actions/sales-inbox'
import { safeEmailPreview } from './email-preview'

const lead = { id: 'lead', assignee_id: 'rep', first_name: 'A', ghl_contact_id: 'contact' }
describe('aggregate conversation contract (synthetic only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    f.admin.mockResolvedValue({ role: 'sales_rep', userId: 'rep' })
    f.refresh.mockResolvedValue({ state: 'unavailable', reason: 'Saved history only' })
    f.history.mockResolvedValue({ hasMore: false, messages: [{
      id: 'email', source: 'appointment', channel: 'email', direction: 'outbound', subject: 'Original subject',
      html: '<p style="color:#123456">Original message <a href="https://private.invalid/token">Join</a></p>',
      contentAvailable: true, recipient: 'original@example.invalid', dispatchState: 'sent', providerStatus: 'delivered',
      status: 'delivered', createdAt: '2026-10-12T10:00:00Z', sentAt: '2026-10-12T10:00:00Z', deliveredAt: '2026-10-12T10:01:00Z',
    }] })
    f.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM sales_leads')) return { rows: [lead] }
      if (sql.includes('FROM sales_inbox_messages m\n')) return { rows: [{ id: 'text', channel: 'sms', direction: 'outbound', body: 'Hello', state: 'accepted', status: 'delivered', created_at: '2026-10-12T11:00:00Z' }] }
      if (sql.includes('SELECT a.*')) return { rows: [{ id: 'call', kind: 'provider_call', body: 'Call', occurred_at: '2026-10-12T09:00:00Z' }] }
      return { rows: [] }
    })
  })
  it('merges frozen emails, SMS statuses and authenticated call capabilities chronologically', async () => {
    const result = await getConversation('lead')
    expect(result.messages.map(m => m.id)).toEqual(['call','email','text'])
    expect(result.messages[0]).toMatchObject({ callMedia: { detailsUrl: '/api/sales/leads/lead/calls/call/details' } })
    expect(result.messages[1]).toMatchObject({ subject: 'Original subject', status: 'delivered', emailSnapshot: { recipient: 'original@example.invalid', dispatchState: 'sent' } })
    expect(JSON.stringify(result.messages[1])).not.toContain('private.invalid')
    expect(result.messages[2]).toMatchObject({ canonical_status: 'delivered' })
    expect(result.synchronization.state).toBe('unavailable')
    expect(f.history).toHaveBeenCalledWith('lead')
    const externalSql = f.query.mock.calls.find(([sql]) => sql.includes('SELECT a.*'))![0]
    expect(externalSql).toContain('m.lead_id=a.lead_id')
    expect(externalSql).toContain('am.lead_id=a.lead_id')
    expect(f.query.mock.calls.find(([sql]) => sql.includes('SELECT d.*'))![0]).toContain("d.channel='sms'")
  })
  it('does not read history or contact the provider for another rep', async () => {
    f.admin.mockResolvedValue({ role: 'sales_rep', userId: 'other' })
    await expect(getConversation('lead')).rejects.toThrow('not available')
    expect(f.refresh).not.toHaveBeenCalled()
    expect(f.history).not.toHaveBeenCalled()
  })
  it('checks ownership again before returning content', async () => {
    f.admin.mockResolvedValueOnce({ role: 'sales_rep', userId: 'rep' })
      .mockResolvedValueOnce({ role: 'sales_rep', userId: 'rep' })
      .mockResolvedValue({ role: 'sales_rep', userId: 'other' })
    await expect(getConversation('lead')).rejects.toThrow('not available')
  })
  it('reports bounded history and missing snapshots without inventing content', async () => {
    f.history.mockResolvedValue({ hasMore: true, messages: [{ id: 'missing', channel: 'email', direction: 'outbound', html: null, contentAvailable: false, status: 'uncertain', createdAt: '2026-10-12T10:00Z' }] })
    const result = await getConversation('lead')
    expect(result.historyTruncated).toBe(true)
    expect(result.messages[1]).toMatchObject({ body: null, emailSnapshot: { html: null, contentAvailable: false }, status: 'uncertain' })
  })
})

describe('email preview isolation', () => {
  it('retains branded text and safe styles but strips network, executable and private link content', () => {
    const clean = safeEmailPreview(`<script>alert(1)</script><style>@import 'https://tracker.invalid';</style>
      <meta http-equiv="refresh" content="0;url=https://private.invalid">
      <img src="https://tracker.invalid/pixel"><iframe srcdoc="bad"></iframe>
      <form action="https://private.invalid"><input value="secret"></form>
      <p onclick="alert(1)" style="color:#123456;background-image:url(https://tracker.invalid);font-size:18px">
      Patient Pipeline <a href="javascript:alert(1)">Join</a> https://private.invalid/auth?token=secret</p>`)
    expect(clean).toContain('Patient Pipeline')
    expect(clean).toContain('color:#123456')
    expect(clean).toContain('font-size:18px')
    expect(clean).not.toMatch(/script|onclick|href|src|tracker|private\.invalid|secret|background-image|<form|<input|<meta/)
  })
})
