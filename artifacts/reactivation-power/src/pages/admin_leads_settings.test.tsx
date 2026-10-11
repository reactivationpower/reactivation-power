// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { salesAutomationMissing, salesAutomationRequirements } from '@workspace/shared/sales-automation'

const mocks = vi.hoisted(() => ({ calls: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('@/lib/api', () => ({
  action: (_module: string, name: string) => (mocks.calls[name] ??= vi.fn()),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('wouter', () => ({ Link: ({ children }: { children: unknown }) => children, useLocation: () => ['/admin/leads/settings'] }))
vi.mock('@/components/leads/quick-switches', () => ({ QuickSwitches: () => null }))
vi.mock('@/components/leads/appointment-messaging', () => ({ AppointmentMessaging: () => null }))
import AdminLeadsSettingsPage from './admin_leads_settings'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const healthyWake = { state: 'verified', requirement: 'ok', checkedAt: ago(60_000) }
const GHL = ['contacts', 'conversations', 'messages', 'notes', 'appointments']

/** The live database today: assignee, approved texts and a healthy scheduler, nothing else. */
function current(over: Record<string, unknown> = {}) {
  return {
    default_assignee_id: 'admin-1', approved_at: ago(86_400_000), scope_reviewed_at: null,
    capabilities_checked_at: null, capabilities: { scheduler_wake: healthyWake } as Record<string, { state: string; requirement: string; checkedAt?: string | null }>,
    automation_enabled: false, followup_texts: ['Hi STOP'], later_days: [7, 14, 28], ...over,
  }
}
function allReady() {
  const caps: Record<string, { state: string; requirement: string; checkedAt?: string | null }> = { scheduler_wake: healthyWake, sms_write: { state: 'operator_confirmed', requirement: '' } }
  for (const k of GHL) caps[k] = { state: 'verified', requirement: '' }
  return current({ scope_reviewed_at: ago(1000), capabilities_checked_at: ago(3_600_000), capabilities: caps })
}

describe('automation readiness rules', () => {
  it('lists exactly what is missing in the current real case', () => {
    expect(salesAutomationMissing(current(), NOW).map((r) => r.key)).toEqual(['scope', 'checks_fresh', ...GHL, 'sms_write'])
    const all = salesAutomationRequirements(current(), NOW)
    expect(all.filter((r) => r.ok).map((r) => r.key)).toEqual(['scheduler', 'assignee', 'texts'])
  })

  it('is ready only when every server requirement is met', () => {
    expect(salesAutomationMissing(allReady(), NOW)).toEqual([])
  })

  it('treats missing, failed or stale checks as not passing', () => {
    const r = allReady()
    expect(salesAutomationMissing({ ...r, capabilities_checked_at: ago(86_400_001) }, NOW).map((x) => x.key)).toEqual(['checks_fresh'])
    const { notes: _n, ...noNotes } = r.capabilities
    expect(salesAutomationMissing({ ...r, capabilities: noNotes }, NOW).map((x) => x.key)).toEqual(['notes'])
    expect(salesAutomationMissing({ ...r, capabilities: { ...r.capabilities, messages: { state: 'ok' } } }, NOW).map((x) => x.key)).toEqual(['messages'])
    expect(salesAutomationMissing({ ...r, capabilities: { ...r.capabilities, sms_write: { state: 'review_required' } } }, NOW).map((x) => x.key)).toEqual(['sms_write'])
    expect(salesAutomationMissing({ ...r, capabilities: { ...r.capabilities, scheduler_wake: { ...healthyWake, checkedAt: ago(600_000) } } }, NOW).map((x) => x.key)).toEqual(['scheduler'])
    expect(salesAutomationMissing({ ...r, capabilities: null }, NOW).map((x) => x.key)).toEqual(['scheduler', ...GHL, 'sms_write'])
  })

  it('says what to do and where for each missing step', () => {
    const fixes = Object.fromEntries(salesAutomationMissing(current(), NOW).map((r) => [r.key, r.fix]))
    expect(fixes.scope).toBe('Click Mark scope reviewed above.')
    expect(fixes.checks_fresh).toBe('Click Run checks above.')
    expect(fixes.contacts).toBe('Click Run checks above.')
    expect(fixes.sms_write).toBe('Click Run checks above, then confirm your texting number.')
    const afterChecks = current({ capabilities_checked_at: ago(1000), capabilities: { scheduler_wake: healthyWake, sms_write: { state: 'review_required', requirement: '' } } })
    expect(salesAutomationMissing(afterChecks, NOW).find((r) => r.key === 'sms_write')?.fix).toBe('Click "Yes, it\'s approved" in GoHighLevel checks above.')
  })
})

const fn = (name: string) => (mocks.calls[name] ??= vi.fn())
function setup(settings: ReturnType<typeof current>, superAdmin = true) {
  fn('listSalesLeads').mockResolvedValue({ leads: [], total: 0, team: [{ id: 'admin-1', name: 'Jacob', email: 'j@example.com', active: true }], settings, reply_notifications: true, admin_id: 'admin-1', super_admin: superAdmin })
  fn('salesCadencePreview').mockResolvedValue([])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AdminLeadsSettingsPage /></QueryClientProvider>)
}

describe('Enable automation button', () => {
  beforeEach(() => {
    for (const f of Object.values(mocks.calls)) f.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  it('stays disabled and shows the missing steps in the current real case', async () => {
    setup(current())
    const button = await screen.findByTestId('button-toggle-automation') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    const missing = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-ok') === 'false').map((li) => li.getAttribute('data-testid'))
    expect(missing).toEqual(['scope', 'checks_fresh', ...GHL, 'sms_write'].map((k) => `automation-req-${k}`))
    expect(screen.getByTestId('automation-checklist').textContent).toContain('8 steps left')
    expect(screen.getByTestId('automation-req-scope').textContent).toContain('Click Mark scope reviewed above.')
    for (const k of ['scheduler', 'assignee', 'texts']) expect(screen.getByTestId(`automation-req-${k}`).getAttribute('data-ok')).toBe('true')
  })

  it('turns on when ready and keeps the server error next to the button until the next try', async () => {
    setup(allReady())
    const button = await screen.findByTestId('button-toggle-automation') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fn('saveSalesSettings').mockRejectedValueOnce(new Error('Recheck capabilities before enabling'))
    fireEvent.click(button)
    expect((await screen.findByTestId('automation-error')).textContent).toBe('Recheck capabilities before enabling')
    fn('saveSalesSettings').mockReturnValueOnce(new Promise(() => {}))
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByTestId('automation-error')).toBeNull())
    expect(fn('saveSalesSettings')).toHaveBeenLastCalledWith({ enableAutomation: true })
  })

  it('tells non-super-admins why they cannot change it', async () => {
    setup(allReady(), false)
    expect(((await screen.findByTestId('button-toggle-automation')) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Only super admins can change these settings.')).toBeTruthy()
  })
})
