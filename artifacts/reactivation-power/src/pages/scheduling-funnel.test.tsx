import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
vi.mock('@/app/actions/leads', () => ({ lookupZip: vi.fn(), submitHealthcareLead: vi.fn() }))
vi.mock('@/components/site/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/site/site-footer', () => ({ SiteFooter: () => null }))
vi.mock('@/components/marketing/marketing-header', () => ({ MarketingHeader: () => null }))
vi.mock('@/components/marketing/marketing-footer', () => ({ MarketingFooter: () => null }))
import WebsiteSchedule from './schedule-a-call'
import StrategySchedule from './strategy-call_schedule'
import { LeadForm } from '@/components/landing/lead-form'

describe('shared practice form funnel isolation', () => {
  it('explicitly opts in only the main website scheduling page', () => {
    const { container } = render(<WebsiteSchedule />)
    expect(container.querySelector<HTMLInputElement>('input[name="funnelSource"]')?.value).toBe('main-website')
    expect(container.querySelector<HTMLInputElement>('input[name="leadSource"]')?.value).toBe('schedule-a-call')
  })
  it('keeps strategy-call on the shared form without the website marker', () => {
    const { container } = render(<StrategySchedule />)
    expect(container.querySelector('input[name="funnelSource"]')).toBeNull()
    expect(container.querySelector<HTMLInputElement>('input[name="leadSource"]')?.value).toBe('schedule-a-call')
  })
  it('keeps contact/calculator forms outside the website scheduling flow', () => {
    const { container } = render(<LeadForm />)
    expect(container.querySelector('input[name="funnelSource"]')).toBeNull()
    expect(container.querySelector('input[name="leadSource"]')).toBeNull()
  })
})
