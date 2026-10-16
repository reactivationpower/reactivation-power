import { render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  simulation: {
    mode: 'simulation', leadId: 'fictional', patient: 'Melissa Tran', submittedAt: '2026-10-01T16:00:00Z',
    practice: 'Fictional practice', campaign: { name: 'Fictional $49 campaign' },
    clock: '2026-10-12T15:00:00Z', recipientTimezone: 'America/Denver', consent: true, stopped: false,
    ownership: 'team', reason: 'Staff takeover', nextOpening: '2026-10-12T15:00:00Z',
    messages: [{ id: 'fixture', role: 'assistant', text: 'Your preferences need staff confirmation.',
      at: '2026-10-10T16:00:00Z', source: 'model', delivery: 'simulated', modelId: 'fixture-not-ai', tokens: 0 }],
    events: ['Synthetic fixture'], revision: 1, pending: null, reminderAt: null,
    preferences: 'Wednesday after 3', policy: { timezone: 'America/Denver' },
  },
  isDemo: true, liveEnabled: false, budget: { reservedCents: 80, limitCents: 100, calls: 22 },
}))
vi.mock('@/lib/api', () => ({ action: () => vi.fn().mockResolvedValue(state) }))
import { TextConversation } from './text-conversation'
it('renders timezone-aware transcript, provenance and handoff without incompatible Intl options', async () => {
  const view = render(<TextConversation leadId="fictional" />)
  await waitFor(() => expect(screen.getByText('Your preferences need staff confirmation.')).toBeTruthy())
  expect(screen.getByText('Staff takeover')).toBeTruthy()
  expect(view.container.textContent).toContain('fixture-not-ai')
  expect(view.container.textContent).toContain('Wednesday after 3')
  view.unmount()
})
