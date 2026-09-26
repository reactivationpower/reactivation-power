// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import PortalStartPage from './portal_start'

const usePageData = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-page-data', () => ({ usePageData }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('portal start product doors', () => {
  const cases = [
    { label: 'reactivation only', reactivation: true, leadFollowUp: false },
    { label: 'lead only', reactivation: false, leadFollowUp: true },
    { label: 'both', reactivation: true, leadFollowUp: true },
    { label: 'neither', reactivation: false, leadFollowUp: false },
  ]

  for (const { label, reactivation, leadFollowUp } of cases) {
    it(`shows correctly gated doors for ${label}`, async () => {
      usePageData.mockReturnValue({ loading: false, error: null, data: {
        participant: { first_name: 'Alex' },
        products: { reactivation, leadFollowUp },
        practiceName: 'Clinic', activeCampaigns: 1, newLeads: 2, callNext: [],
      } })
      const user = userEvent.setup()
      const { hook, history } = memoryLocation({ path: '/portal/start', record: true })
      render(<Router hook={hook}><PortalStartPage /></Router>)
      expect(usePageData).toHaveBeenCalledWith('/portal/start')

      for (const { name, enabled, testId, href } of [
        { name: 'Reactivation', enabled: reactivation, testId: 'tile-reactivation', href: '/portal' },
        { name: 'Lead Follow-Up', enabled: leadFollowUp, testId: 'tile-lead-followup', href: '/portal/leads/start' },
      ]) {
        const card = screen.getByTestId(testId)
        if (enabled) {
          expect(card.tagName).toBe('A')
          expect(card.getAttribute('href')).toBe(href)
          expect(card.textContent).toContain(`Open ${name}`)
          await user.click(card)
          expect(history.at(-1)).toBe(href)
        } else {
          expect(card.tagName).toBe('BUTTON')
          expect(card.getAttribute('href')).toBeNull()
          expect(card.textContent).toContain('Not active')
          const previousPath = history.at(-1)
          await user.click(card)
          const dialog = await screen.findByRole('dialog')
          expect(dialog.textContent).toContain(`Contact us to activate ${name}`)
          expect(history.at(-1)).toBe(previousPath)
          await user.click(screen.getByRole('button', { name: 'Close' }))
        }
      }
      expect(Boolean(screen.queryByTestId('text-lead-summary'))).toBe(leadFollowUp)
      expect(Boolean(screen.queryByRole('heading', { name: 'Call next' }))).toBe(leadFollowUp)
    })
  }
})