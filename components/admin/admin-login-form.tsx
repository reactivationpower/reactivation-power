'use client'

import { useActionState } from 'react'
import { adminLogin } from '@/app/actions/admin-auth'
import { Button } from '@/components/ui/button'

export function AdminLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(adminLogin, null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="admin-password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Checking…' : 'Sign in'}
      </Button>
    </form>
  )
}
