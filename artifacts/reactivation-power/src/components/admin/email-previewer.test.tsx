import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EMAIL_TEMPLATES } from '@workspace/shared/email-templates'
import { EmailPreviewer } from './email-previewer'

vi.mock('@/lib/notify', () => ({ notifyDone: vi.fn(), notifyError: vi.fn() }))
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

it('previews and copies the current HTML for every template with the approved links', async () => {
  vi.useFakeTimers()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const { container } = render(<EmailPreviewer />)
  expect(screen.getByText('https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd')).toBeTruthy()
  const selectors = screen.getAllByRole('button', { name: /^\d{2}/ })
  const copyButton = screen.getByRole('button', { name: 'Copy Code' })
  for (const [index, template] of EMAIL_TEMPLATES.entries()) {
    fireEvent.click(selectors[index])
    const iframe = container.querySelector('iframe')!
    const doc = new DOMParser().parseFromString(iframe.srcdoc, 'text/html')
    expect([...doc.querySelectorAll('.btn a, a:has(img)')].map(a => a.getAttribute('href')))
      .toEqual(Array(2).fill('https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd'))
    await act(async () => { fireEvent.click(copyButton) })
    expect(writeText).toHaveBeenLastCalledWith(template.html)
  }
  expect(writeText).toHaveBeenCalledTimes(68)
}, 30_000)
