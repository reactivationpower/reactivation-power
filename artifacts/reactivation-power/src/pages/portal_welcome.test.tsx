// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { WelcomeHome } from '@/components/portal/welcome-home'
import { PortalNav, PortalHomeLink } from '@/components/portal/portal-nav'
import PortalTrainingPage from './portal_training'
import LeadPracticeSelectPage from './portal_leads_practice'

const usePageData = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-page-data', () => ({ usePageData }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('graduated welcome navigation', () => {
  for (const [product, path, cards, guide] of [
    ['reactivation', '/portal', ['/portal/training', '/portal/contacts', '/portal/dialer', '/portal/analytics'], ['/portal/training', '/portal/contacts', '/portal/dialer', '/portal/analytics']],
    ['lead', '/portal/leads/start', ['/portal/campaigns', '/portal/leads?view=calls', '/portal/leads/practice', '/portal/leads/analytics'], ['/portal/campaigns', '/portal/leads?view=calls', '/portal/leads/practice', '/portal/leads/analytics']],
  ] as const) {
    it(`${product} keeps each card and guidance link navigable`, async () => {
      const { hook, history } = memoryLocation({ path, record: true })
      render(<Router hook={hook}><WelcomeHome product={product} /></Router>)
      expect(screen.getByRole('heading', { name: 'Where would you like to go?' })).toBeTruthy()
      for (let i = 0; i < 4; i++) {
        const card = screen.getByTestId(`link-welcome-${product}-${i + 1}`)
        expect(card.getAttribute('href')).toBe(cards[i])
        await userEvent.click(card)
        expect(history.at(-1)).toBe(cards[i])
        expect(screen.getByTestId(`link-guidance-${product}-${i + 1}`).getAttribute('href')).toBe(guide[i])
      }
    })
  }
  it('leaves tabs unselected on welcomes and maps logo to the correct product home', () => {
    usePageData.mockReturnValue({ data: { products: { leadFollowUp: true }, participant: { role: 'owner' } } })
    for (const [path, home] of [['/portal', '/portal'], ['/portal/leads/start', '/portal/leads/start']]) {
      const { hook } = memoryLocation({ path })
      const view = render(<Router hook={hook}><PortalHomeLink>Logo</PortalHomeLink><PortalNav /></Router>)
      expect(screen.getByRole('link', { name: 'Logo' }).getAttribute('href')).toBe(home)
      expect(screen.getByRole('navigation', { name: 'Portal' }).querySelector('[aria-current="page"]')).toBeNull()
      view.unmount()
    }
  })
  it('keeps training and course/practice routes highlighted, without selecting the welcome', () => {
    usePageData.mockReturnValue({ data: { products: { leadFollowUp: false }, participant: { role: 'owner' } } })
    for (const path of ['/portal/training', '/portal/course/intro', '/portal/dialer/script']) {
      const { hook } = memoryLocation({ path })
      const view = render(<Router hook={hook}><PortalNav /></Router>)
      expect(screen.getByRole('link', { name: 'Training' }).getAttribute('aria-current')).toBe('page')
      expect(screen.getByRole('navigation', { name: 'Portal' }).querySelectorAll('[aria-current="page"]')).toHaveLength(1)
      view.unmount()
    }
  })
  it('hides owner-only lead analytics from staff while preserving practice', () => {
    render(<WelcomeHome product="lead" isOwner={false} />)
    expect(screen.queryByTestId('link-welcome-lead-4')).toBeNull()
    expect(screen.queryByTestId('link-guidance-lead-4')).toBeNull()
    expect(screen.getByTestId('link-welcome-lead-3').getAttribute('href')).toBe('/portal/leads/practice')
  })
  it('offers distinct persistent call queue and lead inventory links to owner and staff', async () => {
    for (const role of ['owner', 'staff']) {
      usePageData.mockReturnValue({ data: { products: { leadFollowUp: true }, participant: { role } } })
      const { hook, history, navigate } = memoryLocation({ path: '/portal/campaigns', record: true })
      const view = render(<Router hook={hook}><PortalNav /></Router>)
      const nav = screen.getByRole('navigation', { name: 'Portal' })
      const labels = Array.from(nav.querySelectorAll('a[href^="/portal/"]')).filter(a => a.getAttribute('data-testid')?.startsWith('link-lead-nav-')).map(a => a.textContent?.trim())
      expect(labels).toEqual(role === 'owner' ? ['Calls Now', 'Leads', 'Campaigns', 'Analytics'] : ['Calls Now', 'Leads', 'Campaigns'])
      const calls = screen.getByRole('link', { name: 'Calls Now' })
      const leads = screen.getByRole('link', { name: 'Leads' })
      expect(calls.getAttribute('href')).toBe('/portal/leads?view=calls')
      expect(leads.getAttribute('href')).toBe('/portal/leads?view=all')
      await userEvent.click(calls)
      expect(history.at(-1)).toBe('/portal/leads?view=calls')
      expect(calls.getAttribute('aria-current')).toBe('page')
      expect(leads.getAttribute('aria-current')).toBeNull()
      await userEvent.click(leads)
      expect(leads.getAttribute('aria-current')).toBe('page')
      expect(calls.getAttribute('aria-current')).toBeNull()
      act(() => navigate('/portal/leads'))
      expect(calls.getAttribute('aria-current')).toBe('page')
      expect(leads.getAttribute('aria-current')).toBeNull()
      view.unmount()
    }
  })
})

describe('real training and practice destinations', () => {
  it('retains owner Add Staff, course progress, and accessible script practice', () => {
    usePageData.mockReturnValue({ loading: false, error: null, data: {
      participant: { first_name: 'Alex' }, isOwner: true, entityLabel: 'practice', activeStaff: 1,
      withProgress: [{ course: { id: '1', slug: 'intro', title: 'Intro' }, completed: 1, total: 2, percent: 50 }],
    } })
    render(<PortalTrainingPage />)
    expect(usePageData).toHaveBeenCalledWith('/portal/training')
    expect(screen.getByRole('link', { name: /Intro/ }).getAttribute('href')).toBe('/portal/course/intro')
    expect(screen.getByText('1 of 2 videos complete')).toBeTruthy()
    expect(screen.getByText('Add Staff Member')).toBeTruthy()
    expect(screen.getByTestId('link-training-practice').getAttribute('href')).toBe('/portal/dialer/script?from=training')
  })
  it('offers campaign-specific practice and a setup path when empty', () => {
    usePageData.mockReturnValue({ loading: false, error: null, data: { campaigns: [
      { id: 'c1', name: 'Spring offer', status: 'active' },
      { id: 'c2', name: 'Old offer', status: 'archived' },
    ] } })
    const view = render(<LeadPracticeSelectPage />)
    expect(usePageData).toHaveBeenCalledWith('/portal/leads/practice')
    expect(screen.getByTestId('link-practice-campaign-c1').getAttribute('href')).toBe('/portal/campaigns/c1/practice')
    expect(screen.queryByTestId('link-practice-campaign-c2')).toBeNull()
    view.unmount()
    usePageData.mockReturnValue({ loading: false, error: null, data: { campaigns: [] } })
    render(<LeadPracticeSelectPage />)
    expect(screen.getByTestId('text-practice-empty')).toBeTruthy()
    expect(screen.getByTestId('link-practice-campaign-setup').getAttribute('href')).toBe('/portal/campaigns')
  })
})