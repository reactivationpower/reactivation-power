import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgreementSigning } from './agreement-signing'

const api = vi.hoisted(() => ({
  getAgreementPublic: vi.fn(), getEnrollmentCheckout: vi.fn(), getAgreementCheckout: vi.fn(),
  recordAgreementInitials: vi.fn(), getAgreementVersion: vi.fn(),
  acknowledgeAgreementDisplay: vi.fn(),
}))
vi.mock('@/app/actions/agreements', () => api)
vi.mock('@/lib/stripe-client', () => ({ stripePromise: null }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => children, PaymentElement: () => null,
  useElements: () => null, useStripe: () => null,
}))
vi.mock('./signature-pad', () => ({ SignaturePad: () => <div>Signature</div>, SignatureImage: () => null }))
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => <input type="checkbox" checked={checked}
    onChange={e => onCheckedChange(e.target.checked)} />,
}))

function fixture(enrollment_flow: boolean, extra = {}) {
  return {
    token: 'fixture', enrollment_flow, version: 1, status: 'viewed', signed: false,
    completed: false, expired: false, offer_type: 'one_time',
    customer: { full_name: 'Example Signer', business_name: 'Example Practice', email: 'fixture@example.test' },
    amounts: { term_months: 12, monthly_cents: 47500, setup_fee_cents: 47500, notice_days: 0 },
    document: { fields: {}, sections: ['first', 'second', 'third'].map(id => ({
      id, title: id, paragraphs: ['Terms'], hash: id, requiresInitials: true,
    })) },
    initials: {}, company: { email: 'fixture@example.test' }, ...extra,
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.getEnrollmentCheckout.mockResolvedValue({ ok: true, checkout: { stage: 'primary' } })
  api.getAgreementCheckout.mockResolvedValue({ ok: true, checkout: { stage: 'primary' } })
  api.acknowledgeAgreementDisplay.mockResolvedValue({ ok: true })
})

describe.each([true, false])('signing flow enrollment=%s', enrollment => {
  it('uses the same explicit reuse and exact versioned API input; never enables signing with missing initials', async () => {
    const agreement = fixture(enrollment)
    api.getAgreementPublic.mockResolvedValue(agreement)
    const saved: Record<string, string> = {}
    api.recordAgreementInitials.mockImplementation(async (_token, input) => {
      saved[input.sectionId] = input.initials
      return { ok: true, initials: { ...saved } }
    })
    const user = userEvent.setup()
    render(<AgreementSigning token="fixture" initial={agreement} />)
    await act(async () => {})
    await user.type(screen.getByRole('textbox', { name: 'Your initials for first' }), 'ab{Enter}')
    await waitFor(() => expect(within(screen.getByTestId('initials-first')).getByText('Saved')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Use AB initials for second' }))
    await waitFor(() => expect(within(screen.getByTestId('initials-second')).getByText('Saved')).toBeTruthy())
    expect(api.recordAgreementInitials.mock.calls).toEqual([
      ['fixture', { version: 1, sectionId: 'first', initials: 'AB' }],
      ['fixture', { version: 1, sectionId: 'second', initials: 'AB' }],
    ])
    expect((screen.getByRole('textbox', { name: 'Your initials for third' }) as HTMLInputElement).value).toBe('')
    const submit = enrollment
      ? screen.getByRole('button', { name: 'Save signature — no payment yet' })
      : screen.getByTestId('submit-agreement')
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('reloads a stale version and clears drafts without automatically initialing the changed document', async () => {
    const initial = fixture(enrollment, { initials: { first: 'AB' } })
    api.getAgreementPublic.mockResolvedValue(initial)
    api.recordAgreementInitials.mockImplementation(async () => {
      api.getAgreementPublic.mockResolvedValue(fixture(enrollment, { version: 2 }))
      return { ok: false, stale: true, error: 'The agreement was updated.' }
    })
    const user = userEvent.setup()
    render(<AgreementSigning token="fixture" initial={initial} />)
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'Use AB initials for second' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Use/ })).toBeNull())
    expect((screen.getByRole('textbox', { name: 'Your initials for first' }) as HTMLInputElement).value).toBe('')
    expect(api.recordAgreementInitials).toHaveBeenCalledTimes(1)
    await user.type(screen.getByRole('textbox', { name: 'Your initials for first' }), 'cd{Enter}')
    await waitFor(() => expect(api.recordAgreementInitials).toHaveBeenLastCalledWith('fixture',
      { version: 2, sectionId: 'first', initials: 'CD' }))
  })

  it('signed documents are read-only', async () => {
    const agreement = fixture(enrollment, { signed: true, initials: { first: 'AB', second: 'AB', third: 'AB' } })
    api.getAgreementPublic.mockResolvedValue(agreement)
    render(<AgreementSigning token="fixture" initial={agreement} />)
    await act(async () => {})
    expect(screen.queryByRole('textbox', { name: /Your initials/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull()
    expect(api.recordAgreementInitials).not.toHaveBeenCalled()
  })
})

it('a delayed enrollment refresh cannot erase initials confirmed after that refresh started', async () => {
  let resolve!: (value: any) => void
  const initial = fixture(true)
  api.getAgreementPublic.mockReturnValueOnce(new Promise(r => { resolve = r }))
  api.recordAgreementInitials.mockResolvedValue({ ok: true, initials: { first: 'AB' } })
  const user = userEvent.setup()
  render(<AgreementSigning token="fixture" initial={initial} />)
  await user.type(screen.getByRole('textbox', { name: 'Your initials for first' }), 'ab{Enter}')
  await waitFor(() => expect(within(screen.getByTestId('initials-first')).getByText('Saved')).toBeTruthy())
  await act(async () => { resolve(initial) })
  expect(within(screen.getByTestId('initials-first')).getByText('Saved')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use AB initials for second' })).toBeTruthy()
})
