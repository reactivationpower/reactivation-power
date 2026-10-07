import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CallsDueSection } from './calls-due-section'

vi.mock('./call-queue', () => ({
  CallQueue: ({ queue }: { queue: any[] }) => <ul>{queue.map(item => <li key={item.contact.id}>{item.contact.name}</li>)}</ul>,
}))
vi.mock('./add-more-calls', () => ({ AddMoreCalls: () => null }))

afterEach(() => vi.useRealTimers())
describe('service-aware Calls Due Now', () => {
  it('puts a future same-day rotation under later, not now despite its quarterly reason', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T16:00:00Z'))
    const item = { contact: { id: 'p', name: 'Waiting for quiet gap' }, follow_up: {
      id: 'f', reason: 'quarterly', call_context: 'rotation', due_at: '2026-10-07T17:00:00Z',
    } }
    render(<CallsDueSection followUps={[item]} newCalls={[]} waiting={0} batchSize={7} />)
    expect(screen.getByText('No calls to make right now.')).toBeTruthy()
    expect(screen.getByText('Coming up later today').parentElement?.parentElement?.textContent).toContain('Waiting for quiet gap')
  })
  it('keeps a due promised callback visible even after its old time-of-day band has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T20:00:00Z'))
    const item = { contact: { id: 'p', name: 'Promised callback' }, follow_up: {
      id: 'f', reason: 'manual', call_context: 'callback', due_at: '2026-10-07T13:00:00Z',
    } }
    render(<CallsDueSection followUps={[item]} newCalls={[]} waiting={0} batchSize={7} />)
    expect(screen.getByText('Calls due now').parentElement?.parentElement?.textContent).toContain('Promised callback')
    expect(screen.queryByText('Coming up later today')).toBeNull()
  })
})
