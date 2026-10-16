import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const saveSource = vi.fn(async () => ({ success: true }))
const sendTest = vi.fn(async () => ({ outcome: 'created' }))
vi.mock('@/app/actions/lead-followup', () => ({
  saveCampaignLeadSource: (...a: unknown[]) => saveSource(...(a as [])),
  sendTestWebhook: (...a: unknown[]) => sendTest(...(a as [])),
  regenerateWebhookUrl: vi.fn(),
  saveWebhookFieldMapping: vi.fn(),
}))
vi.mock('@/hooks/use-router', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ConnectLeadsPanel, buildHandoffText } from './connect-leads-panel'
import { GhlGuide } from './lead-sources-tab'

const campaign = { id: 'c1', name: 'Back Pain $49', status: 'active', offerItems: ['Exam'], leadSourceSetup: 'unsure' }
const base = { campaign, webhookUrl: 'https://x.test/hook/secret', offerLine: '$49', nowMs: Date.now(), onOpenSettings: vi.fn() }

describe('ConnectLeadsPanel', () => {
  beforeEach(() => { saveSource.mockClear(); sendTest.mockClear() })

  it('shows unfinished state and saves the chosen source', async () => {
    render(<ConnectLeadsPanel {...base} connectionSummary={{ lastExternalReceivedAt: null, lastInternalTestAt: null }} initiallyOpen />)
    expect(screen.getByText('Finish connecting your lead form')).toBeTruthy()
    fireEvent.click(screen.getByTestId('radio-source-facebook'))
    await waitFor(() => expect(saveSource).toHaveBeenCalledWith('c1', 'facebook'))
    expect(screen.getByTestId('instructions-facebook').textContent).toMatch(/no Facebook setting to paste/)
    expect(screen.getByTestId('text-receipt-status').textContent).toMatch(/Nothing received yet/)
  })

  it('internal test never claims the real form worked', async () => {
    render(<ConnectLeadsPanel {...base} campaign={{ ...campaign, leadSourceSetup: 'website' }} connectionSummary={{ lastExternalReceivedAt: null, lastInternalTestAt: null }} initiallyOpen />)
    fireEvent.click(screen.getByTestId('button-internal-test'))
    await waitFor(() => expect(screen.getByTestId('text-connect-notice').textContent).toMatch(/does not check your real form/))
    expect(screen.getByTestId('text-receipt-status').textContent).toMatch(/Nothing received yet/)
  })

  it('labels an older receipt as history, not proof of the form being tested', () => {
    render(<ConnectLeadsPanel {...base} campaign={{ ...campaign, leadSourceSetup: 'ghl' }} connectionSummary={{ lastExternalReceivedAt: '2026-01-01T12:00:00Z', lastInternalTestAt: null }} initiallyOpen={false} />)
    expect(screen.getByTestId('text-last-received').textContent).toMatch(/Last external delivery received/)
    expect(screen.getByTestId('text-last-received').textContent).toMatch(/not proof of a new form submission/)
    expect(screen.queryByText('Your lead form is connected')).toBeNull()
    fireEvent.click(screen.getByTestId('button-toggle-setup'))
    expect(screen.getByTestId('text-receipt-status').textContent).toMatch(/older receipt alone does not verify/)
    expect(screen.getByTestId('text-receipt-status').textContent).not.toMatch(/Your form reached us/)
    fireEvent.click(screen.getByTestId('button-connection-settings'))
    expect(base.onOpenSettings).toHaveBeenCalled()
  })

  it('rolls back and reports a network failure on save', async () => {
    saveSource.mockRejectedValueOnce(new Error('offline'))
    render(<ConnectLeadsPanel {...base} connectionSummary={{ lastExternalReceivedAt: null, lastInternalTestAt: null }} initiallyOpen />)
    fireEvent.click(screen.getByTestId('radio-source-website'))
    await waitFor(() => expect(screen.getByTestId('text-connect-notice').textContent).toMatch(/Could not save/))
    expect(screen.queryByTestId('instructions-website')).toBeNull()
  })

  it('copy link and handoff are visible while collapsed', () => {
    render(<ConnectLeadsPanel {...base} connectionSummary={{ lastExternalReceivedAt: null, lastInternalTestAt: null }} initiallyOpen={false} />)
    expect(screen.getByTestId('button-copy-connect-url-header')).toBeTruthy()
    expect(screen.getByTestId('button-handoff-header')).toBeTruthy()
  })

  it('handoff text carries campaign, url, warning and fields', () => {
    const t = buildHandoffText({ campaign, offerLine: '$49', webhookUrl: 'https://x.test/hook/secret', source: 'facebook' })
    expect(t).toMatch(/Back Pain \$49/)
    expect(t).toMatch(/https:\/\/x.test\/hook\/secret/)
    expect(t).toMatch(/PRIVATE/)
    expect(t).toMatch(/first_name/)
    expect(t).toMatch(/zapier.com/)
  })

  it('renders the native form route when GoHighLevel is selected, without using internal receipts as proof', async () => {
    render(<ConnectLeadsPanel {...base} connectionSummary={{ lastExternalReceivedAt: null, lastInternalTestAt: '2026-01-01T12:00:00Z' }} initiallyOpen />)
    fireEvent.click(screen.getByTestId('radio-source-ghl'))
    await waitFor(() => expect(saveSource).toHaveBeenCalledWith('c1', 'ghl'))
    const instructions = screen.getByTestId('instructions-ghl')
    expect(within(instructions).getByRole('list').textContent).toMatch(/Form Submitted.*Form Is/s)
    expect(screen.getByTestId('text-receipt-status').textContent).toMatch(/Nothing received yet/)
    await waitFor(() => expect((screen.getByTestId('button-internal-test') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('button-internal-test'))
    await waitFor(() => expect(screen.getByTestId('text-connect-notice').textContent).toMatch(/does not check your real form/))
    expect(screen.getByTestId('text-receipt-status').textContent).toMatch(/Nothing received yet/)
  })

  it('keeps the GHL handoff form setup and form test together, with a separate tag route', () => {
    const text = buildHandoffText({ ...base, source: 'ghl' })
    const formRoute = text.split('Separate tag route')[0]
    expect(formRoute).toMatch(/Form Submitted\. Add the Form Is filter and select that exact form/)
    expect(formRoute).toMatch(/ordinary Webhook \(not Custom Webhook\), Method POST/)
    expect(formRoute).toMatch(/Standard name and phone fields are sent automatically; no manual mapping/)
    expect(formRoute).toMatch(/Save Action, Publish and save/)
    expect(formRoute).toMatch(/submit that same actual published form once/)
    expect(formRoute).not.toMatch(/Contact Tag/)
    expect(text).toMatch(/Separate tag route.*Contact Tag > Tag added.*Test by adding that tag/s)
    expect(text).toMatch(/new successful delivery at the time of your submission.*name and phone on the Leads tab/s)
    expect(text).toMatch(/internal test or an older receipt does not prove/)
    expect(text).not.toMatch(/Reactivation Power|It shows as received.*within a minute/)
  })
})

describe('GhlGuide', () => {
  it('uses the exact form trigger and an actual submission in the primary numbered route', () => {
    const copy = vi.fn()
    const { container } = render(<GhlGuide webhookUrl={base.webhookUrl} campaignName={campaign.name} copy={copy} copied={false} />)
    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps[0].textContent).toMatch(/Sites → Forms.*exact name/s)
    expect(steps[1].textContent).toContain(`Send ${campaign.name} leads to Patient Pipeline`)
    expect(steps[2].textContent).toMatch(/Form Submitted.*Form Is.*exact form name/s)
    expect(steps[2].textContent).not.toMatch(/Contact Tag/)
    expect(steps[3].textContent).toMatch(/ordinary Webhook.*not Custom Webhook.*POST/s)
    expect(steps[3].textContent).toMatch(/name and phone.*automatically.*no manual mapping/s)
    const verification = steps.at(-1)!.textContent
    expect(verification).toMatch(/Publish.*actual published page or public link.*same form.*Form Is.*submit it once/s)
    expect(verification).toMatch(/Adding a tag does not test this form trigger/)
    expect(verification).toMatch(/new successful GoHighLevel delivery at the time.*Leads.*match the name and phone/s)
    expect(verification).toMatch(/internal test or an older receipt does not prove/)
    expect(verification).toMatch(/same phone may update an existing lead/)
    expect(container.textContent).not.toMatch(/Reactivation Power/)
    const tagRoute = screen.getByTestId('ghl-tag-route').textContent
    expect(tagRoute).toMatch(/Contact Tag.*Tag added.*POST.*Publish/s)
    expect(tagRoute).toMatch(/Add that exact tag.*tests the tag workflow only, not the original form/s)
    fireEvent.click(screen.getByTestId('button-copy-webhook-url-ghl'))
    expect(copy).toHaveBeenCalledWith(base.webhookUrl)
  })
})
