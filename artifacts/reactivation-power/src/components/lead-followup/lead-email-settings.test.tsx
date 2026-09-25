// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/api', () => ({ action: (_module: string, name: string) => name === 'getLeadEmailSettings' ? mocks.load : mocks.save }))
import { LeadEmailSettings } from './lead-email-settings'
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({ settings: { enabled: false, recipient: '' } })
  mocks.save.mockResolvedValue({ settings: { enabled: true, recipient: 'office@example.com' } })
})
describe('lead email settings', () => {
  it('loads opt-in settings, submits a custom recipient and confirms save', async () => {
    render(<LeadEmailSettings />)
    const checkbox = await screen.findByRole('checkbox')
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByLabelText('Notification email address'), { target: { value: 'office@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save notifications' }))
    await screen.findByText('Notification preferences saved.')
    expect(mocks.save).toHaveBeenCalledWith({ enabled: true, recipient: 'office@example.com' })
  })
  it('shows server error without claiming preferences were saved', async () => {
    mocks.save.mockResolvedValue({ error: 'Settings unavailable' })
    render(<LeadEmailSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Save notifications' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Settings unavailable')
    expect(screen.queryByText('Notification preferences saved.')).toBeNull()
  })
  it('loads persisted preferences again after remount and shows loading failures', async () => {
    mocks.load.mockResolvedValueOnce({ settings: { enabled: true, recipient: 'team@example.com' } })
    const first = render(<LeadEmailSettings />)
    await waitFor(() => expect((screen.getByLabelText('Notification email address') as HTMLInputElement).value).toBe('team@example.com'))
    first.unmount()
    mocks.load.mockResolvedValueOnce({ error: 'Database update required' })
    render(<LeadEmailSettings />)
    expect((await screen.findByRole('alert')).textContent).toBe('Database update required')
    expect(mocks.load).toHaveBeenCalledTimes(2)
  })
})