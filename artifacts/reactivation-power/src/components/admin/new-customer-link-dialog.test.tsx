import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewCustomerLinkDialog } from './new-customer-link-dialog'

const mocks = vi.hoisted(() => ({
  load: vi.fn(), create: vi.fn(), retry: vi.fn(), notify: vi.fn(), refresh: vi.fn(), invalidate: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ loadPage: mocks.load }))
vi.mock('@/app/actions/payments', () => ({ createPaymentLink: mocks.create, retryCustomerEnrollment: mocks.retry }))
vi.mock('@/lib/notify', () => ({ notifyDone: mocks.notify, notifyError: vi.fn() }))
vi.mock('@/hooks/use-router', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }))
const customer = {
  fullName: 'Known Contact', businessName: 'Known Practice', businessAddress: 'Known address',
  phone: '5555551234', ownerName: 'Known Owner', ownerPhone: '5555559876', email: 'known@example.test',
}
const savedLink = { id: 'offer-1', customer_id: 'customer-1', name: customer.fullName, amount_cents: 10000 }
const mount = () => render(<NewCustomerLinkDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

describe('lead enrollment setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/admin/payments?lead=lead-1')
    mocks.load.mockResolvedValue({ existingCustomerId: 'customer-1', customer })
    mocks.create.mockResolvedValue({ ok: true, link: savedLink, invitation: { status: 'failed', error: 'Delivery unavailable' } })
  })

  it('loads existing customer data without conversion, an offer, or a success announcement', async () => {
    mount()
    await screen.findByDisplayValue('Known address')
    expect(screen.getByDisplayValue('Known Owner')).toBeTruthy()
    expect(mocks.load).toHaveBeenCalledWith('/admin/enrollment-setup', { lead: 'lead-1', customer: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('routes an already-linked lead to its customer instead of offering accidental enrollment', async () => {
    mocks.load.mockResolvedValue({ continueCustomerId: 'customer-1' })
    mount()
    const link = await screen.findByRole('link', { name: 'View customer / continue enrollment' })
    expect(link.getAttribute('href')).toBe('/admin/customers/customer-1')
    expect(screen.queryByLabelText('Amount (USD)')).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('keeps setup blocked when prefill fails rather than submitting empty or stale identity', async () => {
    mocks.load.mockRejectedValue(new Error('Customer not found'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('Customer not found')
    expect(screen.queryByRole('button', { name: 'Create full-payment offer & email agreement' })).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('distinguishes saved customer from failed invitation and retries the same offer', async () => {
    mount()
    await screen.findByDisplayValue('Known address')
    fireEvent.change(screen.getByLabelText('Amount (USD)'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create full-payment offer & email agreement' }))
    await screen.findByText('Customer and offer saved — no payment collected.')
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      customer, existingCustomerId: 'customer-1', salesLeadId: 'lead-1',
      offer: { type: 'one_time', amountDollars: 100 }, requestId: expect.any(String),
    }))
    expect(screen.getByRole('link', { name: 'View customer' }).getAttribute('href')).toBe('/admin/customers/customer-1')
    mocks.retry.mockResolvedValue({ ok: true, invitation: { status: 'provider_accepted' } })
    fireEvent.click(screen.getByRole('button', { name: 'Retry enrollment email' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Inbox delivery is not yet confirmed'))
    expect(mocks.retry).toHaveBeenCalledWith('offer-1')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['sales-leads'] })
  })
})
