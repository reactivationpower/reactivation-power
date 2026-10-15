import { useEffect, useState, type FormEvent } from 'react'
import {
  login, verifyLoginCode, resendLoginCode, requestPasswordSetup,
  setPortalPassword, type LoginState,
} from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BillingNotice } from '@/components/billing-notice'

type Mode = 'password' | 'code' | 'request' | 'set-password'
export function LoginForm({ next, email, setupToken, pendingLogin }: {
  next?: string; email?: string; setupToken?: string; pendingLogin?: LoginState | null
}) {
  const [mode, setMode] = useState<Mode>(setupToken ? 'set-password' : pendingLogin?.codeSent ? 'code' : 'password')
  const [state, setState] = useState<LoginState>(pendingLogin ?? {})
  const [pending, setPending] = useState(false)
  const [address, setAddress] = useState(pendingLogin?.email ?? email ?? '')
  // The server sends the real remaining wait (15 seconds after a fresh code), also after a reload.
  const [resendAt, setResendAt] = useState(pendingLogin?.codeSent ? Date.now() + (pendingLogin.resendAfter ?? 0) * 1000 : 0)
  const [now, setNow] = useState(Date.now())
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function run(operation: () => Promise<LoginState>, submittedMode: Mode) {
    setPending(true)
    try {
      const result = await operation()
      setState(result)
      if (result.email) setAddress(result.email)
      if (submittedMode === 'set-password' && (result.passwordSet || result.codeSent)) {
        // Remove the one-time link from history, without leaving the page.
        window.history.replaceState(null, '', `${import.meta.env.BASE_URL.replace(/\/$/, '')}/login`)
      }
      if (result.codeSent) {
        setMode('code')
        setNow(Date.now())
        setResendAt(Date.now() + (result.resendAfter ?? 0) * 1000)
      } else if (result.passwordSet) {
        setMode('password')
      } else if (submittedMode === 'code') {
        setMode('password')
      }
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : 'The request failed. Please try again.' })
    } finally { setPending(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const operation = mode === 'code' ? verifyLoginCode : mode === 'request' ? requestPasswordSetup
      : mode === 'set-password' ? setPortalPassword : login
    await run(() => operation({}, form), mode)
  }
  const changeMode = (value: Mode) => { setMode(value); setState({}) }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next ?? ''} />
      {mode === 'set-password' ? (
        <>
          <h2 className="text-lg font-semibold">Set your password</h2>
          <input type="hidden" name="token" value={setupToken ?? ''} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password"
              minLength={12} maxLength={128} required />
            <p className="text-xs text-muted-foreground">Use at least 12 characters. Never share your password.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password"
              minLength={12} maxLength={128} required />
          </div>
        </>
      ) : mode === 'code' ? (
        <>
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            Enter the six-digit code sent to {address || state.email || 'your registered email'}.
            It expires in five minutes and can only be used once.
            If you don't see it in a minute, check your spam or junk folder.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Sign-in code</Label>
            <Input id="code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}"
              autoComplete="one-time-code" maxLength={6} placeholder="123456" required />
          </div>
          {state.attemptsRemaining != null && (
            <p className="text-xs text-muted-foreground">
              {`${state.attemptsRemaining} incorrect attempt${state.attemptsRemaining === 1 ? '' : 's'} remaining.`}
            </p>
          )}
        </>
      ) : (
        <>
          {mode === 'request' && <h2 className="text-lg font-semibold">Set up or reset your password</h2>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email (username)</Label>
            <Input id="email" name="email" type="email" autoComplete="username"
              value={address} onChange={event => setAddress(event.target.value)}
              placeholder="you@example.com" maxLength={254} required />
            <p className="text-xs text-muted-foreground">
              Use your own registered email, not a shared office inbox. Each owner and caller needs an individual account.
            </p>
          </div>
          {mode === 'password' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password"
                maxLength={128} required />
            </div>
          )}
        </>
      )}
      {state.billing && <BillingNotice reason={state.billing.reason} email={state.billing.email} />}
      {state.error && !state.billing && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Please wait…' : mode === 'code' ? 'Verify code and sign in'
          : mode === 'request' ? 'Email password link' : mode === 'set-password' ? 'Save password' : 'Continue'}
      </Button>
      {mode === 'code' && (
        <Button type="button" variant="outline" disabled={pending || seconds > 0}
          onClick={() => void run(() => resendLoginCode(), 'code')}>
          {seconds > 0 ? `Resend code in ${seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`}` : 'Resend code'}
        </Button>
      )}
      {mode === 'password' ? (
        <button type="button" disabled={pending} className="text-sm text-primary underline underline-offset-4"
          onClick={() => changeMode('request')}>Set up or reset password</button>
      ) : (
        <button type="button" disabled={pending} className="text-sm text-primary underline underline-offset-4"
          onClick={() => changeMode('password')}>Back to sign in</button>
      )}
    </form>
  )
}
