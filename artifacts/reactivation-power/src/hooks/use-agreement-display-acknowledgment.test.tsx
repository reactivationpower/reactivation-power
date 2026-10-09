import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAgreementDisplayAcknowledgment } from './use-agreement-display-acknowledgment'

const acknowledge = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/agreements', () => ({ acknowledgeAgreementDisplay: acknowledge }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); acknowledge.mockReset() })

function Display({ disabled = false, token = 'fixture-token' }) {
  useAgreementDisplayAcknowledgment(token, 1, disabled)
  return <article data-agreement-document>Actual agreement</article>
}

it('acknowledges either signing screen only after trusted visible-document interaction, once', async () => {
  acknowledge.mockResolvedValue({ ok: true })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 30, bottom: 600 } as DOMRect)
  const listener = vi.spyOn(window, 'addEventListener')
  render(<Display />)
  expect(acknowledge).not.toHaveBeenCalled()
  const handler = listener.mock.calls.find(([type]) => type === 'pointerdown')![1] as (event: Event) => Promise<void>
  await act(async () => { await handler({ isTrusted: false } as Event) })
  expect(acknowledge).not.toHaveBeenCalled()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  await act(async () => { await handler({ isTrusted: true } as Event) })
  expect(acknowledge).not.toHaveBeenCalled()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  await act(async () => { await handler({ isTrusted: true } as Event) })
  await act(async () => { await handler({ isTrusted: true } as Event) })
  expect(acknowledge).toHaveBeenCalledExactlyOnceWith('fixture-token', 1)
})

it('does not install display acknowledgment for signed or expired agreements', () => {
  const listener = vi.spyOn(window, 'addEventListener')
  render(<Display disabled />)
  expect(listener.mock.calls.some(([type]) => type === 'pointerdown')).toBe(false)
  expect(acknowledge).not.toHaveBeenCalled()
})
