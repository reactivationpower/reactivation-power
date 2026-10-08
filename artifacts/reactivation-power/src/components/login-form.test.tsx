import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'

const actions = vi.hoisted(() => ({
  login: vi.fn(), verifyLoginCode: vi.fn(), resendLoginCode: vi.fn(),
  requestPasswordSetup: vi.fn(), setPortalPassword: vi.fn(),
}))
vi.mock('@/app/actions/auth', () => actions)
beforeEach(() => {
  Object.values(actions).forEach(fn => fn.mockReset())
})
afterEach(cleanup)
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('portal password and email-code form', () => {
  it('sends email and password, then verifies the single-use code without sending a name', async () => {
    actions.login.mockResolvedValue({ codeSent: true, attemptsRemaining: 6, resendAfter: 60 })
    actions.verifyLoginCode.mockResolvedValue({ codeSent: true, attemptsRemaining: 5, error: 'Incorrect code.' })
    render(<LoginForm next="/portal/settings" />)
    expect(screen.queryByLabelText('First name')).toBeNull()
    type('Email (username)', 'caller@example.invalid')
    type('Password', 'a long test password')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('Sign-in code')
    const form = actions.login.mock.calls[0][1] as FormData
    expect(form.get('email')).toBe('caller@example.invalid')
    expect(form.get('password')).toBe('a long test password')
    expect(form.get('next')).toBe('/portal/settings')
    const resend = screen.getByRole('button', { name: /Resend code/ })
    expect(resend.hasAttribute('disabled') || resend.getAttribute('aria-disabled') === 'true' || resend.hasAttribute('data-disabled')).toBe(true)
    type('Sign-in code', '123456')
    fireEvent.click(screen.getByRole('button', { name: 'Verify code and sign in' }))
    await screen.findByRole('alert')
    expect((actions.verifyLoginCode.mock.calls[0][1] as FormData).get('code')).toBe('123456')
    expect(screen.getByText('5 incorrect attempts remaining.')).toBeTruthy()
  })
  it('offers existing users a password setup request to their individual registered email', async () => {
    actions.requestPasswordSetup.mockResolvedValue({ message: 'If this email is registered, check your inbox.' })
    render(<LoginForm email="owner@example.invalid" />)
    fireEvent.click(screen.getByRole('button', { name: 'Set up or reset password' }))
    fireEvent.click(screen.getByRole('button', { name: 'Email password link' }))
    await screen.findByText('If this email is registered, check your inbox.')
    expect((actions.requestPasswordSetup.mock.calls[0][1] as FormData).get('email')).toBe('owner@example.invalid')
    expect(screen.getByText(/not a shared office inbox/)).toBeTruthy()
  })
  it('consumes a setup token and returns to password login, never directly to a protected page', async () => {
    actions.setPortalPassword.mockResolvedValue({ passwordSet: true, message: 'Password set.' })
    render(<LoginForm setupToken="one-time-test-token" />)
    type('New password', 'a long test password')
    type('Confirm password', 'a long test password')
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(screen.getByLabelText('Email (username)')).toBeTruthy())
    expect((actions.setPortalPassword.mock.calls[0][1] as FormData).get('token')).toBe('one-time-test-token')
    expect(actions.login).not.toHaveBeenCalled()
  })
})
