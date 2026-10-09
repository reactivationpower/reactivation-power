import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EMAIL_TEMPLATES } from '@workspace/shared/email-templates'
import { EmailPreviewer } from './email-previewer'

vi.mock('@/lib/notify', () => ({ notifyDone: vi.fn(), notifyError: vi.fn() }))

it('previews and copies the current HTML for every template with the approved links', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const { container } = render(<EmailPreviewer />)
  expect(screen.getByText('https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd')).toBeTruthy()
  for (const [index, template] of EMAIL_TEMPLATES.entries()) {
    fireEvent.click(screen.getByRole('button', {
      name: `${String(index + 1).padStart(2, '0')}${template.name.replace(/^Email \d+ — /, '')}`,
    }))
    const iframe = container.querySelector('iframe')!
    const doc = new DOMParser().parseFromString(iframe.srcdoc, 'text/html')
    expect([...doc.querySelectorAll('.btn a, a:has(img)')].map(a => a.getAttribute('href')))
      .toEqual(Array(2).fill('https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Code' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(template.html))
  }
  expect(writeText).toHaveBeenCalledTimes(68)
}, 30_000)
