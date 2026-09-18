// @ts-nocheck

import { useActionState } from 'react'
import { adminLogin, completeAdminInvite } from '@/app/actions/admin-auth'
import { Button } from '@/components/ui/button'

const inputClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function AdminLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(adminLogin, null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

/**
 * Shown when the page was opened from an invite link. Either our own link
 * (?token_hash=…&type=…) or Supabase's default invite email, which lands with
 * #access_token=…&type=invite in the URL hash.
 */
export interface InviteToken {
  tokenHash?: string
  type?: string
  accessToken?: string
}

export function AdminSetPasswordForm({ token }: { token: InviteToken }) {
  const [state, formAction, pending] = useActionState(completeAdminInvite, null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={token.tokenHash ?? ''} />
      <input type="hidden" name="type" value={token.type ?? ''} />
      <input type="hidden" name="access_token" value={token.accessToken ?? ''} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-sm font-medium text-foreground">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Set password and sign in'}
      </Button>
    </form>
  )
}
