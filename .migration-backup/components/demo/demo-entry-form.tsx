'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { enterDemo } from '@/app/actions/demo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type State = { error?: string }
const initialState: State = {}

async function submit(_prev: State, formData: FormData): Promise<State> {
  const res = await enterDemo(formData)
  return res ?? {}
}

export function DemoEntryForm() {
  const [state, formAction, pending] = useActionState(submit, initialState)
  const [show, setShow] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="demo-password">Demo password</Label>
        <div className="relative">
          <Input
            id="demo-password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            autoFocus
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Preparing the demo…
          </>
        ) : (
          'Open the demo'
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground text-pretty">
        The first open of the day rebuilds the sample data so every date is
        current. That can take a few seconds.
      </p>
    </form>
  )
}
