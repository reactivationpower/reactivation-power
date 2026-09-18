'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { addTeamMember } from '@/app/actions/reactivation'
import { MAX_STAFF } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/reactivation/phone-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type ButtonProps = React.ComponentProps<typeof Button>

/**
 * The ONE "add a caller" dialog — used from Settings (Callers card) and from
 * the Training page header ("Add Staff Member"). Same form, same action, same
 * MAX_STAFF cap, so the two entry points can never drift apart.
 */
export function AddCallerDialog({
  entityLabel,
  activeCount,
  triggerLabel = 'Add caller',
  triggerVariant = 'outline',
  triggerSize = 'sm',
}: {
  entityLabel: string
  activeCount: number
  triggerLabel?: string
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const atLimit = activeCount >= MAX_STAFF

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    const res = await addTeamMember(fd)
    setSubmitting(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setError(null)
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={triggerVariant}
            size={triggerSize}
            className="gap-2"
            disabled={atLimit}
            title={
              atLimit
                ? `You already have ${MAX_STAFF} active callers — deactivate one to add another.`
                : undefined
            }
          />
        }
      >
        <UserPlus className="size-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a caller</DialogTitle>
          <DialogDescription>
            They sign in with their own name and email on the login screen (no
            password) and get your {entityLabel}&apos;s training, scripts, and
            call queue. You can have up to {MAX_STAFF} active callers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onAdd} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ac-first">First name</Label>
              <Input id="ac-first" name="firstName" required autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ac-last">Last name</Label>
              <Input id="ac-last" name="lastName" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ac-email">Email address</Label>
            <Input id="ac-email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ac-phone">
              Phone{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <PhoneInput id="ac-phone" name="phone" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add caller'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
