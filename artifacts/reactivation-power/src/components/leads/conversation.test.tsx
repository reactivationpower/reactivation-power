// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InboxConversation } from '@/app/actions/sales-inbox'

const api = vi.hoisted(() => ({ getConversation: vi.fn(), refreshConversation: vi.fn(), sendMessage: vi.fn() }))
vi.mock('@/app/actions/sales-inbox', () => api)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
import { LeadConversation, snapshotDoc } from './conversation'

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

const conv = (id: string, extra: Partial<InboxConversation> = {}): InboxConversation => ({
  lead: { id, first_name: 'Test', last_name: id, email: 't@example.test', phone: '+15550100' },
  readiness: { email: true, sms: true, reasons: [] }, contactUrl: null,
  messages: [
    { id: 's1', channel: 'sms', direction: 'inbound', body: 'Synthetic text', status: null, created_at: '2024-01-01T10:00:00Z' },
    { id: 'e1', channel: 'email', direction: 'outbound', body: null, subject: 'Synthetic subject', status: 'sent', created_at: '2024-01-01T09:00:00Z',
      emailSnapshot: { html: '<p style="color:#123">Branded body</p>', contentAvailable: true, recipient: 't@example.test', from: 'team@example.test', replyTo: null, dispatchState: 'accepted', providerStatus: 'delivered', sentAt: '2024-01-01T09:00:00Z', deliveredAt: null } },
    { id: 'e2', channel: 'email', direction: 'outbound', body: null, status: null, created_at: '2024-01-01T08:00:00Z',
      emailSnapshot: { html: null, contentAvailable: false, recipient: null, from: null, replyTo: null, dispatchState: 'failed', providerStatus: null, sentAt: null, deliveredAt: null } },
    { id: 'c1', channel: 'call', direction: 'event', body: 'Call', status: null, created_at: '2024-01-01T11:00:00Z', callMedia: { detailsUrl: '/api/sales/leads/L/calls/A/details' } },
  ], ...extra,
})
const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { qc, ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>) }
}

it('keeps the draft through failure and reuses the request id on retry', async () => {
  api.getConversation.mockResolvedValue(conv('A'))
  api.sendMessage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ state: 'sent' })
  wrap(<LeadConversation leadId="A" />)
  const box = await screen.findByTestId('input-sms-body')
  fireEvent.change(box, { target: { value: 'Hello there' } })
  fireEvent.click(screen.getByTestId('button-send-sms'))
  await screen.findByTestId('banner-send-error')
  expect((box as HTMLTextAreaElement).value).toBe('Hello there')
  fireEvent.click(screen.getByTestId('button-send-sms'))
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2))
  const [a, b] = api.sendMessage.mock.calls.map((c) => c[0])
  expect(a.requestId).toBe(b.requestId)
  expect(a.channel).toBe('sms')
  await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''))
})

it('blocks texts over 1600 characters', async () => {
  api.getConversation.mockResolvedValue(conv('A'))
  wrap(<LeadConversation leadId="A" />)
  fireEvent.change(await screen.findByTestId('input-sms-body'), { target: { value: 'x'.repeat(1601) } })
  expect(screen.getByTestId('text-sms-over')).toBeTruthy()
  expect((screen.getByTestId('button-send-sms') as HTMLButtonElement).disabled).toBe(true)
})

it('explains that external email replies do not stop outreach and refreshes lead context after a text', async () => {
  api.getConversation.mockResolvedValue(conv('A'))
  api.sendMessage.mockResolvedValue({ state: 'sent', canonical_state: 'accepted' })
  const { qc } = wrap(<LeadConversation leadId="A" />)
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  fireEvent.click(await screen.findByTestId('tab-conversation-other'))
  expect((await screen.findByTestId('external-reply-warning')).textContent).toContain('does not automatically stop portal outreach')
  fireEvent.click(screen.getByTestId('tab-conversation-texts'))
  fireEvent.change(screen.getByTestId('input-sms-body'), { target: { value: 'Synthetic only' } })
  fireEvent.click(screen.getByTestId('button-send-sms'))
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sales-leads'] }))
})

it('isolates drafts when switching contacts', async () => {
  api.getConversation.mockImplementation((id: string) => Promise.resolve(conv(id)))
  const { qc, rerender } = wrap(<LeadConversation leadId="A" />)
  fireEvent.change(await screen.findByTestId('input-sms-body'), { target: { value: 'For A only' } })
  rerender(<QueryClientProvider client={qc}><LeadConversation leadId="B" /></QueryClientProvider>)
  await screen.findByText('Test B')
  expect((screen.getByTestId('input-sms-body') as HTMLTextAreaElement).value).toBe('')
})

it('shows stale state on refetch error and keeps the draft', async () => {
  api.getConversation.mockResolvedValueOnce(conv('A')).mockRejectedValue(new Error('network down'))
  const { qc } = wrap(<LeadConversation leadId="A" />)
  const box = await screen.findByTestId('input-sms-body')
  fireEvent.change(box, { target: { value: 'Keep me' } })
  await qc.refetchQueries({ queryKey: ['sales-inbox', 'conversation', 'A'] }).catch(() => {})
  await screen.findByTestId('banner-stale')
  expect((screen.getByTestId('input-sms-body') as HTMLTextAreaElement).value).toBe('Keep me')
})

it('drops cached data on authorization loss', async () => {
  api.getConversation.mockResolvedValueOnce(conv('A')).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  const { qc } = wrap(<LeadConversation leadId="A" />)
  await screen.findByText('Synthetic text')
  await qc.refetchQueries({ queryKey: ['sales-inbox', 'conversation', 'A'] }).catch(() => {})
  await screen.findByTestId('conversation-denied')
  expect(screen.queryByText('Synthetic text')).toBeNull()
  await waitFor(() => expect(qc.getQueryData(['sales-inbox', 'conversation', 'A'])).toBeUndefined())
})

it('shows texts as chat bubbles and keeps emails and calls on their own tab', async () => {
  api.getConversation.mockResolvedValue(conv('A', { messages: [
    { id: 's1', channel: 'sms', direction: 'inbound', body: 'Synthetic text', status: null, created_at: '2024-01-01T10:00:00Z' },
    { id: 's2', channel: 'sms', direction: 'outbound', body: 'Our reply', status: 'delivered', canonical_status: 'delivered', created_at: '2024-01-01T10:05:00Z' },
    { id: 'c1', channel: 'call', direction: 'event', body: 'Call', status: null, created_at: '2024-01-01T11:00:00Z' },
  ] }))
  wrap(<LeadConversation leadId="A" />)
  await screen.findByText('Synthetic text')
  expect(screen.getByText('Our reply').className).toContain('bg-primary')
  expect(screen.getByText('Synthetic text').className).not.toContain('bg-primary')
  expect(screen.getByText(/Delivered/)).toBeTruthy()
  expect(screen.queryByTestId('message-c1')).toBeNull()
  fireEvent.click(screen.getByTestId('tab-conversation-other'))
  expect(screen.getByTestId('message-c1')).toBeTruthy()
  expect(screen.queryByText('Synthetic text')).toBeNull()
  fireEvent.click(screen.getByTestId('filter-call'))
  expect(screen.getByTestId('text-other-empty').textContent).toMatch(/Nothing matches/)
})

it('sends with Enter and shows hard stops as one small gray line, not a yellow box', async () => {
  api.getConversation.mockResolvedValueOnce(conv('A')).mockResolvedValue(conv('A'))
  api.sendMessage.mockResolvedValue({ state: 'sent', canonical_state: 'accepted' })
  wrap(<LeadConversation leadId="A" />)
  const box = await screen.findByTestId('input-sms-body')
  fireEvent.change(box, { target: { value: 'Hi' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1))
  cleanup()
  api.getConversation.mockResolvedValue(conv('B', { readiness: { email: false, sms: false, reasons: ['This lead is marked do not contact.'] } }))
  wrap(<LeadConversation leadId="B" />)
  const line = await screen.findByTestId('sms-blocked')
  expect(line.tagName).toBe('P')
  expect(line.textContent).toContain('do not contact')
  expect(line.className).not.toContain('yellow')
  expect(screen.getByTestId('composer-sms').innerHTML).not.toContain('yellow')
  const box2 = screen.getByTestId('input-sms-body') as HTMLTextAreaElement
  fireEvent.change(box2, { target: { value: 'Still typing' } })
  expect(box2.value).toBe('Still typing')
  expect((screen.getByTestId('button-send-sms') as HTMLButtonElement).disabled).toBe(true)
})

it('asks "Send anyway?" for ask-first items; No keeps the draft, Yes sends with the same request id', async () => {
  const confirm = ['It’s 10:15 PM for this lead.']
  api.getConversation.mockResolvedValue(conv('A', { readiness: { email: false, sms: true, reasons: [], confirm } }))
  api.sendMessage.mockResolvedValue({ state: 'sent', canonical_state: 'accepted' })
  wrap(<LeadConversation leadId="A" />)
  const box = await screen.findByTestId('input-sms-body') as HTMLTextAreaElement
  expect(screen.queryByTestId('sms-blocked')).toBeNull()
  fireEvent.change(box, { target: { value: 'Late hello' } })
  fireEvent.click(screen.getByTestId('button-send-sms'))
  expect((await screen.findByTestId('dialog-send-anyway')).textContent).toContain('10:15 PM')
  expect(api.sendMessage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('button-send-anyway-no'))
  await waitFor(() => expect(screen.queryByTestId('dialog-send-anyway')).toBeNull())
  expect(box.value).toBe('Late hello')
  expect(api.sendMessage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('button-send-sms'))
  fireEvent.click(await screen.findByTestId('button-send-anyway-yes'))
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1))
  expect(api.sendMessage.mock.calls[0][0]).toMatchObject({ body: 'Late hello', confirmed: true })
  await waitFor(() => expect(box.value).toBe(''))
})

it('turns a server "Send anyway?" refusal into the popup and resends confirmed with the same request id', async () => {
  api.getConversation.mockResolvedValue(conv('A'))
  api.sendMessage.mockRejectedValueOnce(new Error('It’s 8:05 PM for this lead. Send anyway?')).mockResolvedValueOnce({ state: 'sent', canonical_state: 'accepted' })
  wrap(<LeadConversation leadId="A" />)
  const box = await screen.findByTestId('input-sms-body') as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: 'Evening' } })
  fireEvent.click(screen.getByTestId('button-send-sms'))
  const dialog = await screen.findByTestId('dialog-send-anyway')
  expect(dialog.textContent).toContain('8:05 PM for this lead.')
  expect(screen.queryByTestId('banner-send-error')).toBeNull()
  fireEvent.click(screen.getByTestId('button-send-anyway-yes'))
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2))
  const [a, b] = api.sendMessage.mock.calls.map((c) => c[0])
  expect(a.confirmed).toBeUndefined()
  expect(b).toMatchObject({ requestId: a.requestId, confirmed: true })
  await waitFor(() => expect(box.value).toBe(''))
})

it('shows provider sync failures even when saved history loaded successfully', async () => {
  api.getConversation.mockResolvedValue(conv('A', { synchronization: { state: 'unavailable', reason: 'Provider unavailable; showing saved history' } }))
  wrap(<LeadConversation leadId="A" />)
  expect((await screen.findByTestId('banner-provider-sync')).textContent).toContain('Provider unavailable')
  expect(screen.getByText('Synthetic text')).toBeTruthy()
})

it('treats ownership denial from the RPC as permission loss, not stale data', async () => {
  api.getConversation.mockResolvedValueOnce(conv('A')).mockRejectedValue(new Error('Lead not available to this salesperson'))
  const { qc } = wrap(<LeadConversation leadId="A" />)
  await screen.findByText('Synthetic text')
  await qc.refetchQueries({ queryKey: ['sales-inbox', 'conversation', 'A'] }).catch(() => {})
  await screen.findByTestId('conversation-denied')
  expect(screen.queryByText('Synthetic text')).toBeNull()
})

it('renders email snapshots in a locked sandbox', async () => {
  api.getConversation.mockResolvedValue(conv('A'))
  wrap(<LeadConversation leadId="A" />)
  fireEvent.click(await screen.findByTestId('tab-conversation-other'))
  const frame = await screen.findByTestId('iframe-email-e1') as HTMLIFrameElement
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'")
  expect(frame.getAttribute('srcdoc')).toContain('Branded body')
  expect(screen.getByTestId('email-unavailable-e2')).toBeTruthy()
  expect(snapshotDoc('<b>x</b>')).not.toContain('<script')
})

it('lazy-loads call details and reports honest errors', async () => {
  api.getConversation.mockResolvedValue(conv('A'))
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ state: 'provider_failure', explanation: 'GoHighLevel could not safely return this media. Try again later.' }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ direction: 'outbound', outcome: 'completed', durationSeconds: 65, timestamp: null, ghlLink: { level: 'contact', url: 'https://app.gohighlevel.com/v2/location/location/contacts/detail/contact' }, recording: { playbackUrl: '/api/sales/leads/L/calls/A/recording' }, transcript: { url: '/api/sales/leads/L/calls/A/transcript' } }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ state: 'available', segments: [{ text: 'Synthetic transcript', startMs: 0, channel: 1 }] }) })
  vi.stubGlobal('fetch', fetchMock)
  wrap(<LeadConversation leadId="A" />)
  fireEvent.click(await screen.findByTestId('tab-conversation-other'))
  await screen.findByTestId('button-call-details-c1')
  expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('button-call-details-c1'))
  expect((await screen.findByTestId('call-error-c1')).textContent).toMatch(/could not safely/)
  fireEvent.click(screen.getByText('Try again'))
  fireEvent.click(await screen.findByTestId('button-play-c1'))
  const audio = screen.getByTestId('audio-c1')
  expect(screen.getByText("Open call's contact in GoHighLevel").getAttribute('href')).toBe('https://app.gohighlevel.com/v2/location/location/contacts/detail/contact')
  expect(audio.getAttribute('preload')).toBe('none')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByTestId('button-transcript-c1'))
  expect((await screen.findByTestId('transcript-c1')).textContent).toContain('Synthetic transcript')
})
