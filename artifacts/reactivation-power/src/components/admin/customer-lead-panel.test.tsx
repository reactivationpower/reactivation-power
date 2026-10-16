// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const leadsApi = vi.hoisted(() => ({ getSalesLead: vi.fn(), addSalesNote: vi.fn(), logSalesCall: vi.fn(), getSalesMedia: vi.fn(), listSalesLeads: vi.fn() }))
const inboxApi = vi.hoisted(() => ({ getConversation: vi.fn(), refreshConversation: vi.fn(), sendMessage: vi.fn() }))
vi.mock('@/app/actions/sales-leads', () => leadsApi)
vi.mock('@/app/actions/sales-inbox', () => inboxApi)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
import { CustomerLeadPanel, type LinkedLead } from './customer-lead-panel'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const linked = (id: string, created_at: string): LinkedLead => ({ id, first_name: 'Synthetic', last_name: id, practice_name: 'Fixture Clinic', stage: 'Won', source: 'website', created_at })
const detail = (id: string, customer_id: string | null = 'cust-1') => ({
  lead: { id, first_name: 'Synthetic', last_name: id, email: 's@example.test', phone: '+15550100', practice_name: 'Fixture Clinic', source: 'website', stage: 'Won',
    customer_id, timezone: 'America/New_York', next_followup_at: null, last_reply_at: null, appointment_status: null, created_at: '2026-01-01T10:00:00Z' },
  activities: [{ id: `note-${id}`, kind: 'note', body: `Earlier note for ${id}`, author_name: 'Fixture', disposition: null, status: null, next_followup_at: null, occurred_at: '2026-01-02T10:00:00Z' }],
  submissions: [], jobs: [], contact_url: null, suggested_followup: null,
})
const conversation = (id: string) => ({
  lead: { id, first_name: 'Synthetic', last_name: id, email: 's@example.test', phone: '+15550100' },
  readiness: { email: true, sms: true, reasons: [] }, contactUrl: null,
  messages: [
    { id: `sms-${id}`, channel: 'sms', direction: 'outbound', body: `Sales text before signing ${id}`, status: 'delivered', created_at: '2026-01-01T10:00:00Z' },
    { id: `email-${id}`, channel: 'email', direction: 'outbound', body: 'Synthetic email body', subject: 'Synthetic sales email', status: 'sent', created_at: '2026-01-01T09:00:00Z' },
  ],
})
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

it('shows a plain note when the customer has no lead record', () => {
  wrap(<CustomerLeadPanel leads={[]} superAdmin={false} />)
  expect(screen.getByTestId('customer-no-lead').textContent).toContain('no lead record')
  expect(leadsApi.getSalesLead).not.toHaveBeenCalled()
  expect(inboxApi.getConversation).not.toHaveBeenCalled()
})

it("shows the linked lead's conversation, history and a link to the lead record", async () => {
  leadsApi.getSalesLead.mockImplementation(async (id: string) => detail(id))
  inboxApi.getConversation.mockImplementation(async (id: string) => conversation(id))
  wrap(<CustomerLeadPanel leads={[linked('L1', '2026-01-01T10:00:00Z')]} superAdmin={false} />)
  expect(await screen.findByText('Sales text before signing L1')).toBeTruthy()
  expect(screen.getByTestId('input-sms-body')).toBeTruthy()
  expect(screen.getByTestId('link-open-lead').getAttribute('href')).toBe('/admin/leads/L1')
  expect(screen.queryByTestId('select-customer-lead')).toBeNull()
  fireEvent.click(screen.getByTestId('tab-conversation-other'))
  expect(await screen.findByText('Synthetic sales email')).toBeTruthy()
  fireEvent.click(screen.getByTestId('tab-lead-history'))
  expect(screen.getByText('Earlier note for L1')).toBeTruthy()
})

it('opens the newest of several linked leads and lets staff pick another', async () => {
  leadsApi.getSalesLead.mockImplementation(async (id: string) => detail(id))
  inboxApi.getConversation.mockImplementation(async (id: string) => conversation(id))
  wrap(<CustomerLeadPanel leads={[linked('NEW', '2026-03-01T10:00:00Z'), linked('OLD', '2025-03-01T10:00:00Z')]} superAdmin={false} />)
  expect(await screen.findByText('Sales text before signing NEW')).toBeTruthy()
  const picker = screen.getByTestId('select-customer-lead') as HTMLSelectElement
  expect(picker.value).toBe('NEW')
  fireEvent.change(picker, { target: { value: 'OLD' } })
  expect(await screen.findByText('Sales text before signing OLD')).toBeTruthy()
  expect(screen.getByTestId('link-open-lead').getAttribute('href')).toBe('/admin/leads/OLD')
})

it('logs a call for a linked customer without requiring a follow-up time', async () => {
  leadsApi.getSalesLead.mockImplementation(async (id: string) => detail(id))
  inboxApi.getConversation.mockImplementation(async (id: string) => conversation(id))
  leadsApi.logSalesCall.mockResolvedValue(undefined)
  leadsApi.addSalesNote.mockResolvedValue(undefined)
  wrap(<CustomerLeadPanel leads={[linked('L1', '2026-01-01T10:00:00Z')]} superAdmin={false} />)
  await screen.findByText('Sales text before signing L1')
  fireEvent.click(screen.getByTestId('tab-lead-call'))
  fireEvent.click(screen.getByTestId('chip-No Answer'))
  fireEvent.change(screen.getByTestId('input-call-notes'), { target: { value: 'Checked in after signing' } })
  expect(screen.getByTestId('followup-optional')).toBeTruthy()
  const logBtn = screen.getByTestId('button-log-call') as HTMLButtonElement
  expect(logBtn.disabled).toBe(false)
  fireEvent.click(logBtn)
  await waitFor(() => expect(leadsApi.logSalesCall).toHaveBeenCalledWith('L1', { disposition: 'No Answer', notes: 'Checked in after signing' }))
  fireEvent.change(screen.getByTestId('input-note'), { target: { value: 'Customer note' } })
  fireEvent.click(screen.getByTestId('button-add-note'))
  await waitFor(() => expect(leadsApi.addSalesNote).toHaveBeenCalledWith('L1', 'Customer note'))
})

it('still requires a follow-up time for a lead that is not a customer', async () => {
  leadsApi.getSalesLead.mockImplementation(async (id: string) => detail(id, null))
  inboxApi.getConversation.mockImplementation(async (id: string) => conversation(id))
  wrap(<CustomerLeadPanel leads={[linked('L1', '2026-01-01T10:00:00Z')]} superAdmin={false} />)
  await screen.findByText('Sales text before signing L1')
  fireEvent.click(screen.getByTestId('tab-lead-call'))
  fireEvent.click(screen.getByTestId('chip-No Answer'))
  fireEvent.change(screen.getByTestId('input-call-notes'), { target: { value: 'No pickup' } })
  expect(screen.getByTestId('followup-required')).toBeTruthy()
  expect((screen.getByTestId('button-log-call') as HTMLButtonElement).disabled).toBe(true)
})
