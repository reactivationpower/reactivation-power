import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

  it('shows last real receipt and connection settings when connected', () => {
    render(<ConnectLeadsPanel {...base} connectionSummary={{ lastExternalReceivedAt: new Date().toISOString(), lastInternalTestAt: null }} initiallyOpen={false} />)
    expect(screen.getByTestId('text-last-received').textContent).toMatch(/Last form submission received/)
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
})
