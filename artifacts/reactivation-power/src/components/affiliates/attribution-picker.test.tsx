import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttributionPicker } from './attribution-picker'

const m = vi.hoisted(() => ({ get: vi.fn(), assign: vi.fn(), toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/app/actions/affiliates', () => ({ getAffiliateAttributionCandidates: m.get, assignAffiliate: m.assign }))
vi.mock('sonner', () => ({ toast: m.toast }))

const base = { email: null, affiliate_id: null, affiliate_name: null }
const leads = [
  { ...base, id: 'l1', full_name: 'Jordan Lee', email: 'jordan.a@example.com', practice_name: 'North Smile', protected_until: null, converted_customer_id: null, converted_at: null },
  { ...base, id: 'l2', full_name: 'Jordan Lee', email: 'jordan.b@example.com', practice_name: 'South Smile', protected_until: '2099-01-01', converted_customer_id: 'c9', converted_at: '2025-02-01', affiliate_id: 'aff2', affiliate_name: 'Bay Partners' },
]
const customers = [{ ...base, id: 'c1', full_name: null, business_name: 'Harbor Dental' }]
const all = (search: string, kind?: string) => {
  const s = search.toLowerCase()
  const f = (r: any) => !s || r.id === search || [r.full_name, r.email, r.practice_name, r.business_name].some((v) => v?.toLowerCase().includes(s))
  return Promise.resolve({ leads: kind === 'customer' ? [] : leads.filter(f), customers: kind === 'lead' ? [] : customers.filter(f) })
}

let qc: QueryClient
function setup(onSaved = vi.fn().mockResolvedValue(undefined)) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><AttributionPicker affiliateId="aff1" onSaved={onSaved} /></QueryClientProvider>)
  fireEvent.click(screen.getByTestId('button-candidate-search'))
  return onSaved
}
beforeEach(() => { m.get.mockImplementation(all); m.assign.mockReset() })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AttributionPicker', () => {
  it('distinguishes same-name contacts by secondary info and shows missing-name fallback without raw IDs', async () => {
    setup()
    expect((await screen.findByTestId('candidate-lead-l1'))!.textContent).toContain('jordan.a@example.com')
    expect((screen.getByTestId('candidate-lead-l2'))!.textContent).toContain('South Smile')
    expect((screen.getByTestId('candidate-lead-l2'))!.textContent).toContain('Attributed to Bay Partners')
    expect((screen.getByTestId('candidate-customer-c1'))!.textContent).toContain('Name not on file')
    expect(screen.getByTestId('list-candidates').textContent).not.toMatch(/\bl1\b|\bc1\b|aff2/)
  })

  it('type switch clears selection and filters', async () => {
    setup()
    fireEvent.click(await screen.findByTestId('candidate-lead-l1'))
    expect((await screen.findByTestId('summary-attr-selected'))!.textContent).toContain('North Smile')
    fireEvent.click(screen.getByTestId('filter-attr-kind-customer'))
    expect(screen.getByTestId('text-no-selection')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('candidate-lead-l1')).toBeNull())
    expect(m.get).toHaveBeenCalledWith('', 'customer')
  })

  it('keeps selection summary while search changes, fetched by exact ID', async () => {
    setup()
    fireEvent.click(await screen.findByTestId('candidate-lead-l1'))
    await screen.findByTestId('summary-attr-selected')
    fireEvent.change(screen.getByTestId('input-candidate-search'), { target: { value: 'Harbor' } })
    fireEvent.click(screen.getByTestId('button-candidate-search'))
    await waitFor(() => expect(screen.queryByTestId('candidate-lead-l1')).toBeNull())
    expect((screen.getByTestId('summary-attr-selected'))!.textContent).toContain('Jordan Lee')
    expect(m.get).toHaveBeenCalledWith('l1', 'lead')
  })

  it('disables converted leads with guidance', async () => {
    setup()
    fireEvent.click(await screen.findByTestId('candidate-lead-l2'))
    expect(await screen.findByTestId('text-converted-guidance')).toBeTruthy()
    fireEvent.change(screen.getByTestId('input-attr-reason'), { target: { value: 'fix' } })
    expect((screen.getByTestId('button-assign') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('button-unassign') as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires reason, prevents duplicates while pending, refreshes caches on success', async () => {
    let resolve!: (v: unknown) => void
    m.assign.mockReturnValue(new Promise((r) => { resolve = r }))
    const onSaved = setup()
    fireEvent.click(await screen.findByTestId('candidate-lead-l1'))
    await screen.findByTestId('summary-attr-selected')
    expect((screen.getByTestId('button-assign') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('input-attr-reason'), { target: { value: '  partner call  ' } })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    fireEvent.click(screen.getByTestId('button-assign'))
    fireEvent.click(screen.getByTestId('button-assign'))
    expect(m.assign).toHaveBeenCalledTimes(1)
    expect(m.assign).toHaveBeenCalledWith({ affiliateId: 'aff1', leadId: 'l1', reason: 'partner call' })
    expect((screen.getByTestId('button-assign') as HTMLButtonElement).disabled).toBe(true)
    resolve({ ok: true })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledWith({ queryKey: ['affiliate-candidates'] })
    expect((screen.getByTestId('input-attr-reason') as HTMLInputElement).value).toBe('')
  })

  it('preserves reason and shows error on failure; clear sends null', async () => {
    m.assign.mockRejectedValue(new Error('Lead is locked'))
    const onSaved = setup()
    fireEvent.click(await screen.findByTestId('candidate-customer-c1'))
    await screen.findByTestId('summary-attr-selected')
    fireEvent.change(screen.getByTestId('input-attr-reason'), { target: { value: 'wrong partner' } })
    fireEvent.click(screen.getByTestId('button-unassign'))
    expect((await screen.findByTestId('text-attr-error'))!.textContent).toContain('Lead is locked')
    expect(m.assign).toHaveBeenCalledWith({ affiliateId: null, customerId: 'c1', reason: 'wrong partner' })
    expect((screen.getByTestId('input-attr-reason') as HTMLInputElement).value).toBe('wrong partner')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows error with retry', async () => {
    m.get.mockRejectedValueOnce(new Error('Network down'))
    setup()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Network down')
    fireEvent.click(within(alert).getByTestId('button-candidates-retry'))
    expect(await screen.findByTestId('candidate-lead-l1')).toBeTruthy()
  })

  it('refreshes the named selected contact and profile after clearing successfully', async () => {
    let affiliateId: string | null = 'aff2'
    m.get.mockImplementation(async () => ({
      leads: [], customers: [{ ...customers[0], affiliate_id: affiliateId, affiliate_name: affiliateId ? 'Bay Partners' : null }],
    }))
    m.assign.mockImplementation(async () => { affiliateId = null; return { ok: true } })
    const onSaved = setup()
    fireEvent.click(await screen.findByTestId('candidate-customer-c1'))
    expect((await screen.findByTestId('summary-attr-selected')).textContent).toContain('Bay Partners')
    fireEvent.change(screen.getByTestId('input-attr-reason'), { target: { value: 'Remove incorrect referral' } })
    fireEvent.click(screen.getByTestId('button-unassign'))
    await waitFor(() => expect(screen.getByTestId('summary-attr-selected').textContent).toContain('No partner attributed'))
    expect(screen.getByTestId('candidate-customer-c1').textContent).toContain('No partner attributed')
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect((screen.getByTestId('input-attr-reason') as HTMLInputElement).value).toBe('')
  })
})
