// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RequestedTimeBadge } from './lead-bits'
import { LeadsTable } from './leads-table'

afterEach(cleanup)

describe('form requested-time label', () => {
  it('shows no-time only for unbooked leads without either kind of request', () => {
    const { rerender } = render(<RequestedTimeBadge status="new" requestedTime={null} requestedAt={null} />)
    expect(screen.getByText('Form submitted · No time requested')).toBeTruthy()
    rerender(<RequestedTimeBadge status="attempted" requestedTime="   " requestedAt={null} />)
    expect(screen.getByText('Form submitted · No time requested')).toBeTruthy()
    rerender(<RequestedTimeBadge status="reached" requestedTime="Any weekday afternoon" requestedAt={null} />)
    expect(screen.getByText('Any weekday afternoon')).toBeTruthy()
    expect(screen.queryByText('Form submitted · No time requested')).toBeNull()
    rerender(<RequestedTimeBadge status="new" requestedTime="Tomorrow 3pm" requestedAt="2026-10-06T15:00" />)
    expect(screen.getByText(/Requested:.*Oct 6/)).toBeTruthy()
    rerender(<RequestedTimeBadge status="booked" requestedTime={null} requestedAt={null} />)
    expect(screen.queryByText('Form submitted · No time requested')).toBeNull()
    rerender(<RequestedTimeBadge status="confirmed" requestedTime={null} requestedAt={null} />)
    expect(screen.queryByText('Form submitted · No time requested')).toBeNull()
  })

  it('shows the distinction on the shared leads table', () => {
    render(<LeadsTable nowMs={Date.parse('2026-10-05T12:00:00Z')} rows={[
      { campaign: { id: 'c1', name: 'Offer', status: 'active' }, lead: {
        id: 'l1', firstName: 'Mia', lastName: 'Lee', phone: '4805550100', source: 'webhook',
        status: 'new', submittedAt: '2026-10-05T11:00:00Z', requestedAt: null, requestedTime: null,
      } },
      { campaign: { id: 'c1', name: 'Offer', status: 'active' }, lead: {
        id: 'l2', firstName: 'Jo', lastName: 'West', phone: '4805550101', source: 'webhook',
        status: 'booked', submittedAt: '2026-10-05T11:00:00Z', requestedAt: null, requestedTime: null,
      } },
    ]} />)
    expect(screen.getByTestId('row-lead-l1').textContent).toContain('Form submitted · No time requested')
    expect(screen.getByTestId('row-lead-l2').textContent).not.toContain('No time requested')
  })
})