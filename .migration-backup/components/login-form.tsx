'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: LoginState = {}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next ?? '/portal'} />
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            placeholder="John"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            placeholder="Smith"
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="john@company.com"
          required
        />
        <p className="text-xs text-muted-foreground">
          Your email must be registered by an administrator.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
        />
      </div>
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Access Training'}
      </Button>
    </form>
  )
}
