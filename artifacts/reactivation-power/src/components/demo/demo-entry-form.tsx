// @ts-nocheck

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { enterDemo } from '@/app/actions/demo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEMO_PRACTICES, type DemoPracticeKey } from '@/lib/demo/config'
import { cn } from '@/lib/utils'

type State = { error?: string }
const initialState: State = {}

async function submit(_prev: State, formData: FormData): Promise<State> {
  const res = await enterDemo(formData)
  return res ?? {}
}

/**
 * Shared password, then a choice of which demo practice to walk into. The
 * choice travels with the form as `practice`; the server signs the presenter
 * in as that practice's owner.
 */
export function DemoEntryForm() {
  const [state, formAction, pending] = useActionState(submit, initialState)
  const [show, setShow] = useState(false)
  const [practice, setPractice] = useState<DemoPracticeKey>(DEMO_PRACTICES[0].key)

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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium leading-none">Which practice?</legend>
        <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Demo practice">
          {DEMO_PRACTICES.map((p) => {
            const selected = practice === p.key
            return (
              <label
                key={p.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <input
                  type="radio"
                  name="practice"
                  value={p.key}
                  checked={selected}
                  onChange={() => setPractice(p.key)}
                  className="mt-1 size-4 shrink-0 accent-accent"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  <span className="text-xs text-muted-foreground text-pretty">{p.description}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

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
        The first open of the day rebuilds that practice&rsquo;s sample data so
        every date is current. That can take a few seconds.
      </p>
    </form>
  )
}
