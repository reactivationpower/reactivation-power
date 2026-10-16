'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createParticipant } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserPlus } from 'lucide-react'

export function AddStaffForm({
  parentId,
  disabled,
}: {
  parentId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('parentId', parentId)
    const res = await createParticipant(fd)
    setPending(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={disabled}
          />
        }
      >
        <UserPlus className="size-4" />
        Add staff member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
          <DialogDescription>
            Staff log in with their own email and inherit this
            participant&apos;s course access. Max 3 per participant.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="st-first">First name</Label>
              <Input id="st-first" name="firstName" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="st-last">Last name</Label>
              <Input id="st-last" name="lastName" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="st-email">Email address</Label>
            <Input id="st-email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="st-phone">Phone</Label>
            <Input id="st-phone" name="phone" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add staff member'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
