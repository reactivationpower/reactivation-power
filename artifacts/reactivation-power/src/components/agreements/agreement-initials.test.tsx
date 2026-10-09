import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AgreementDocument } from './agreement-document'

export const sections = [
  { id: 'intro', title: 'Introduction', paragraphs: ['Read these terms.'], hash: 'i', requiresInitials: false },
  ...['first', 'second', 'third'].map(id => ({ id, title: id, paragraphs: ['Required terms.'], hash: id, requiresInitials: true })),
]
type Result = { ok: boolean; error?: string }
function deferred() {
  let resolve!: (result: Result) => void
  const promise = new Promise<Result>(r => { resolve = r })
  return { promise, resolve }
}
function Harness({ save, seed = {}, scope = 'agreement:1', doc = sections, readOnly = false }: {
  save: (id: string, value: string) => Promise<Result>
  seed?: Record<string, string>
  scope?: string
  doc?: typeof sections
  readOnly?: boolean
}) {
  const [initials, setInitials] = useState(seed)
  return <AgreementDocument sections={doc} scope={scope} initials={initials} suggestedInitials="ZZ" readOnly={readOnly}
    onInitial={async (id, value) => {
      const result = await save(id, value)
      if (result.ok) setInitials(prev => ({ ...prev, [id]: value }))
      return result
    }} />
}
const field = (id: string) => screen.getByRole('textbox', { name: `Your initials for ${id}` }) as HTMLInputElement
const box = (id: string) => within(screen.getByTestId(`initials-${id}`))
const success = () => vi.fn(async () => ({ ok: true }))

describe('deliberate section initials', () => {
  it('never reuses a name placeholder or acknowledges on focus, render or scrolling', async () => {
    const save = success()
    const user = userEvent.setup()
    render(<Harness save={save} />)
    expect(field('first').placeholder).toBe('ZZ')
    await user.tab()
    await user.tab()
    fireEvent.scroll(window)
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull()
  })

  it('normalizes first manual entry and click saves the next section immediately; still permits manual edits', async () => {
    const save = success()
    const user = userEvent.setup()
    render(<Harness save={save} />)
    fireEvent.change(field('first'), { target: { value: ' ab ' } })
    fireEvent.keyDown(field('first'), { key: 'Enter' })
    await waitFor(() => expect(box('first').getByText('Saved')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Use AB initials for second' }))
    await waitFor(() => expect(box('second').getByText('Saved')).toBeTruthy())
    expect(save.mock.calls).toEqual([['first', 'AB'], ['second', 'AB']])
    expect(field('third').value).toBe('')
    await user.clear(field('second'))
    await user.type(field('second'), 'cd{Enter}')
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('second', 'CD'))
  })

  it('retains server validation and does not turn rejected input into reusable initials', async () => {
    const pending = deferred()
    const save = vi.fn().mockReturnValue(pending.promise)
    render(<Harness save={save} />)
    fireEvent.change(field('first'), { target: { value: 'A1' } })
    fireEvent.keyDown(field('first'), { key: 'Enter' })
    fireEvent.keyDown(field('first'), { key: 'Enter' })
    fireEvent.blur(field('first'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await act(async () => { pending.resolve({ ok: false, error: 'Enter your initials (1–6 letters).' }) })
    expect(box('first').getByRole('alert').textContent).toContain('1–6 letters')
    expect(box('first').queryByText('Saved')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use A1 initials for second' })).toBeNull()
    expect(field('second').value).toBe('')
  })

  it('keeps the direct blur-to-click acknowledgment while the first save is pending and deduplicates attempts', async () => {
    const first = deferred()
    const second = deferred()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const user = userEvent.setup()
    render(<Harness save={save} />)
    await user.type(field('first'), 'ab')
    await user.click(screen.getByRole('button', { name: 'Use initials from first section for second' }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(box('second').getByText('Saving…')).toBeTruthy()
    expect(box('second').queryByText('Saved')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Use .* for second/ }))
    await act(async () => { first.resolve({ ok: true }) })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save).toHaveBeenLastCalledWith('second', 'AB')
    expect(box('second').queryByText('Saved')).toBeNull()
    await act(async () => { second.resolve({ ok: true }) })
    expect(box('second').getByText('Saved')).toBeTruthy()
  })

  it('does not reuse a failed first save; supports retry without another acknowledgment click', async () => {
    const first = deferred()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<Harness save={save} />)
    await user.type(field('first'), 'ab')
    await user.click(screen.getByRole('button', { name: /Use .* for second/ }))
    await act(async () => { first.resolve({ ok: false, error: 'Network unavailable' }) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(box('second').getByRole('alert').textContent).toContain('First section')
    expect(box('second').queryByText('Saved')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry initials for second' }))
    await waitFor(() => expect(box('second').getByText('Saved')).toBeTruthy())
    expect(save.mock.calls).toEqual([['first', 'AB'], ['first', 'AB'], ['second', 'AB']])
  })

  it('shows a failed reuse or thrown network error and only saves on deliberate retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<Harness save={save} seed={{ first: 'AB' }} />)
    await user.click(screen.getByRole('button', { name: 'Use AB initials for second' }))
    expect(box('second').getByRole('alert')).toBeTruthy()
    expect(box('second').queryByText('Saved')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry initials for second' }))
    await waitFor(() => expect(box('second').getByText('Saved')).toBeTruthy())
  })

  it.each(['{Enter}', ' '])('supports keyboard activation with %s and reload from persisted first initials', async key => {
    const save = success()
    const user = userEvent.setup()
    const view = render(<Harness save={save} seed={{ first: 'AB' }} />)
    const button = screen.getByRole('button', { name: 'Use AB initials for second' })
    button.focus()
    expect(save).not.toHaveBeenCalled()
    await user.keyboard(key)
    await waitFor(() => expect(box('second').getByText('Saved')).toBeTruthy())
    view.unmount()
    render(<Harness save={save} seed={{ first: 'AB', second: 'AB' }} />)
    expect(screen.getByRole('button', { name: 'Use AB initials for third' })).toBeTruthy()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('serializes rapid acknowledgments on different sections', async () => {
    const pending = deferred()
    const save = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<Harness save={save} seed={{ first: 'AB' }} />)
    await user.click(screen.getByRole('button', { name: 'Use AB initials for second' }))
    await user.click(screen.getByRole('button', { name: 'Use AB initials for third' }))
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => { pending.resolve({ ok: true }) })
    await waitFor(() => expect(box('third').getByText('Saved')).toBeTruthy())
    expect(save.mock.calls).toEqual([['second', 'AB'], ['third', 'AB']])
  })

  it.each(['other-agreement:1', 'agreement:2'])('discards drafts and queued reuse on scope change to %s', async scope => {
    const pending = deferred()
    const save = vi.fn().mockReturnValue(pending.promise)
    const user = userEvent.setup()
    const view = render(<AgreementDocument sections={sections} scope="agreement:1" initials={{}} onInitial={save} />)
    await user.type(field('first'), 'AB')
    await user.click(screen.getByRole('button', { name: /Use .* for second/ }))
    view.rerender(<AgreementDocument sections={sections} scope={scope} initials={{}} onInitial={save} />)
    expect(field('first').value).toBe('')
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull()
    await act(async () => { pending.resolve({ ok: true }) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(field('second').value).toBe('')
  })

  it('requires explicit re-initialing changed sections; first must be saved again if changed', async () => {
    const save = success()
    const view = render(<AgreementDocument sections={sections} scope="a:1" initials={{ first: 'AB', second: 'AB' }} onInitial={save} />)
    view.rerender(<AgreementDocument sections={sections} scope="a:2" initials={{ first: 'AB' }} onInitial={save} highlight={new Set(['second'])} />)
    expect(field('second').value).toBe('')
    expect(screen.getByText('Updated — please re-initial')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use AB initials for second' })).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    view.rerender(<AgreementDocument sections={sections} scope="a:3" initials={{}} onInitial={save} />)
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull()
  })

  it('renders immutable signed/completed and admin previews without inputs or actions', () => {
    const save = success()
    render(<Harness save={save} seed={{ first: 'AB', second: 'AB', third: 'AB' }} readOnly />)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByText('Initialed AB')).toHaveLength(3)
    expect(save).not.toHaveBeenCalled()
  })
})
