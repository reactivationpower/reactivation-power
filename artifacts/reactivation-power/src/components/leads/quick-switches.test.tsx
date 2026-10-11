// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({ calls: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('@/lib/api', () => ({
  action: (_module: string, name: string) => (mocks.calls[name] ??= vi.fn()),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { QuickSwitches } from './quick-switches'

const fn = (name: string) => (mocks.calls[name] ??= vi.fn())
const host = { ghl_user_id: 'abcde', admin_id: 'a', name: 'Jacob', reply_email: 'j@example.com', active: true }
function messaging(over: Record<string, unknown> = {}) {
  return { config: { enabled: false, sms_enabled: false }, hosts: [host], superAdmin: true, schedulerReady: true, team: [], deliveries: [], issues: [], ...over }
}
function setup({ sms = false, meet = messaging(), reply = true, superAdmin = true } = {}) {
  fn('getInboxSettings').mockResolvedValue({ superAdmin, settings: { sms_ready: sms, email_ready: true, email_domain: 'x' }, replyTo: 'r@example.com' })
  fn('getAppointmentMessaging').mockResolvedValue(meet)
  fn('listSalesLeads').mockResolvedValue({ leads: [], reply_notifications: reply })
  for (const n of ['saveInboxSettings', 'saveAppointmentMessaging', 'saveSalesReplyPreference']) fn(n).mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><QuickSwitches /></QueryClientProvider>)
}
const sw = (id: string) => screen.findByTestId(`switch-${id}`) as Promise<HTMLButtonElement>

beforeEach(() => {
  for (const f of Object.values(mocks.calls)) f.mockReset()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Leads quick switches', () => {
  it('shows four switches, all off until the owner turns them on, and says when reminders go out', async () => {
    setup({ reply: false })
    for (const id of ['texting', 'reminder-emails', 'reminder-texts', 'reply-email']) expect((await sw(id)).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/when they book, 1 day before, 12 hours before, 2 hours before, and 5 minutes before, by email and text/)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('turns texting on with one click and a short popup', async () => {
    setup()
    fireEvent.click(await sw('texting'))
    expect(window.confirm).toHaveBeenCalledWith('Turn this on?')
    await waitFor(() => expect(fn('saveInboxSettings')).toHaveBeenCalledWith({ smsReady: true }))
  })

  it('does nothing when the popup is cancelled', async () => {
    setup()
    vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(await sw('reminder-emails'))
    expect(fn('saveAppointmentMessaging')).not.toHaveBeenCalled()
  })

  it('turns reminder emails on without texts, and reminder texts on while keeping emails on', async () => {
    setup()
    expect((await screen.findByTestId('reminder-texts-blocker')).textContent).toBe('Turn on reminder emails first.')
    fireEvent.click(await sw('reminder-emails'))
    await waitFor(() => expect(fn('saveAppointmentMessaging')).toHaveBeenCalledWith({ enabled: true, smsEnabled: false, confirmReadiness: true }))
  })

  it('reminder texts switch actually turns automatic reminder texts on', async () => {
    setup({ meet: messaging({ config: { enabled: true, sms_enabled: false } }) })
    expect((await sw('reminder-emails')).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(await sw('reminder-texts'))
    await waitFor(() => expect(fn('saveAppointmentMessaging')).toHaveBeenCalledWith({ enabled: true, smsEnabled: true, confirmReadiness: true }))
  })

  it('keeps reminder texts on when nothing changes them, and turns only texts off', async () => {
    setup({ meet: messaging({ config: { enabled: true, sms_enabled: true } }) })
    expect((await sw('reminder-texts')).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(await sw('reminder-texts'))
    await waitFor(() => expect(fn('saveAppointmentMessaging')).toHaveBeenCalledWith({ enabled: true, smsEnabled: false, confirmReadiness: true }))
  })

  it('shows a short plain reason and blocks turning on when the app is not running or no host is set', async () => {
    setup({ meet: messaging({ schedulerReady: false }) })
    expect((await screen.findByTestId('reminder-emails-blocker')).textContent).toBe('Needs the published app running.')
    expect((await sw('reminder-emails')).disabled).toBe(true)
  })

  it('asks for a call host when none is active', async () => {
    setup({ meet: messaging({ hosts: [{ ...host, active: false }] }) })
    expect((await screen.findByTestId('reminder-emails-blocker')).textContent).toBe('Add who hosts the calls in Advanced.')
  })

  it('lets non-owners change only their own reply email', async () => {
    setup({ superAdmin: false, meet: messaging({ superAdmin: false }) })
    expect((await screen.findByTestId('texting-blocker')).textContent).toBe('Only a super admin can change this.')
    expect((await sw('texting')).disabled).toBe(true)
    fireEvent.click(await sw('reply-email'))
    await waitFor(() => expect(fn('saveSalesReplyPreference')).toHaveBeenCalledWith(false))
  })
})
