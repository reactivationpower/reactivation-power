import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CallScreen } from './call-screen'

const { push, logCall } = vi.hoisted(() => ({ push: vi.fn(), logCall: vi.fn() }))
vi.mock('@/hooks/use-router', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/app/actions/reactivation', () => ({ logCall, setSelectedNiche: vi.fn() }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: any) => open ? <div>{children}<button onClick={() => onOpenChange(false)}>Dismiss saved dialog</button></div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}))
vi.mock('./date-time-picker', () => ({ DateTimePicker: () => null }))

beforeEach(() => {
  push.mockReset()
  logCall.mockReset().mockResolvedValue({ callId: 'saved' })
})

describe('saved reactivation call navigation', () => {
  it.each([
    ['Back to Dialer', '/portal/dialer'],
    ['Next call due', '/portal/dialer/call/next'],
    ['Dismiss saved dialog', '/portal/dialer'],
  ])('navigates safely through %s', async (button, destination) => {
    const saved = vi.fn()
    render(<CallScreen contact={{ id: 'patient', name: 'Test Patient', phone: '2125550190' }}
      leaseToken="lease" callContext="rotation" serviceLabel="Test Service" onCallSaved={saved}
      niches={[]} scriptBody="Hello" sections={[]} initialNicheId={null} nextContactId="next"
      callerName="Caller" practiceName="Practice" officePhone={null} owner={null}
      callHistory={[]} flowSteps={[]} flowChoices={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Spoke, Didn’t Schedule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log call' }))
    await screen.findByText('Call saved')
    expect(saved).toHaveBeenCalledOnce()
    expect(logCall.mock.calls[0][0].get('leaseToken')).toBe('lease')
    fireEvent.click(screen.getByRole('button', { name: button }))
    expect(push).toHaveBeenCalledWith(destination)
  })
})
