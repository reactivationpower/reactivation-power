import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MarketingTextsLibrary } from './marketing-texts-library'
import { MARKETING_TEXTS } from '@workspace/shared/marketing-texts'

const state: { current: any } = { current: null }
vi.mock('@/hooks/use-page-data', () => ({ usePageData: () => state.current }))
vi.mock('@/lib/notify', () => ({ notifyDone: vi.fn(), notifyError: vi.fn() }))

const texts = MARKETING_TEXTS

beforeEach(() => {
  vi.useFakeTimers()
  state.current = { data: { texts, instructions: 'Load these.' }, loading: false, error: null }
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

function mockClipboard(fn: any) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: fn } })
}

it('previews and copies all 20 texts', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  mockClipboard(writeText)
  render(<MarketingTextsLibrary />)
  const selectors = screen.getAllByRole('button', { name: /^\d{2}/ })
  const copyButton = screen.getByRole('button', { name: 'Copy Text' })
  for (const [index, t] of texts.entries()) {
    fireEvent.click(selectors[index])
    expect(screen.getByTestId('text-preview').textContent).toBe(t.body)
    await act(async () => { fireEvent.click(copyButton) })
    expect(writeText).toHaveBeenLastCalledWith(t.body)
  }
  expect(writeText).toHaveBeenCalledTimes(20)
})

it('resets copied feedback on selection change', async () => {
  mockClipboard(vi.fn().mockResolvedValue(undefined))
  render(<MarketingTextsLibrary />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Text' })) })
  expect(screen.getByText('Copied')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '02Give staff the words' }))
  expect(screen.queryByText('Copied')).toBeNull()
})

it('does not show copied when clipboard fails', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('no'))
  mockClipboard(writeText)
  render(<MarketingTextsLibrary />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Text' })) })
  expect(writeText).toHaveBeenCalled()
  expect(screen.queryByText('Copied')).toBeNull()
})

it('shows loading and error states and the download url', () => {
  state.current = { data: null, loading: true, error: null }
  const { unmount } = render(<MarketingTextsLibrary />)
  expect(screen.getByText('Loading…')).toBeTruthy()
  unmount()
  state.current = { data: null, loading: false, error: new Error('Denied') }
  const r = render(<MarketingTextsLibrary />)
  expect(screen.getByText('Denied')).toBeTruthy()
  r.unmount()
  state.current = { data: { texts, instructions: 'x' }, loading: false, error: null }
  render(<MarketingTextsLibrary />)
  expect(screen.getByTestId('link-download-texts').getAttribute('href'))
    .toBe(`${import.meta.env.BASE_URL}api/admin/marketing-texts/export`)
})
