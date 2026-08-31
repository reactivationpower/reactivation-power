'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Users } from 'lucide-react'
import {
  addTeamMember,
  setTeamMemberActive,
} from '@/app/actions/reactivation'
import { MAX_STAFF, type Participant } from '@/lib/types'
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

export function TeamManager({
  members,
  entityLabel,
}: {
  members: Participant[]
  entityLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const activeCount = members.filter((m) => m.is_active).length
  const atLimit = activeCount >= MAX_STAFF

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const res = await addTeamMember(fd)
    if (res?.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  function onToggle(member: Participant) {
    setTogglingId(member.id)
    startTransition(async () => {
      const res = await setTeamMemberActive(member.id, !member.is_active)
      setTogglingId(null)
      if (res?.error) {
        window.alert(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-accent" />
          <h3 className="text-base font-semibold text-foreground">
            Callers
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            {activeCount}/{MAX_STAFF} active
          </span>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={atLimit}
              />
            }
          >
            <UserPlus className="size-4" />
            Add caller
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a caller</DialogTitle>
              <DialogDescription>
                They sign in with their own email on the login screen and get
                your {entityLabel}&apos;s scripts and call queue. You can have
                up to {MAX_STAFF} active callers.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onAdd} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tm-first">First name</Label>
                  <Input id="tm-first" name="firstName" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tm-last">Last name</Label>
                  <Input id="tm-last" name="lastName" required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tm-email">Email address</Label>
                <Input id="tm-email" name="email" type="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tm-phone">Phone (optional)</Label>
                <Input id="tm-phone" name="phone" />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Button type="submit">Add caller</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Add the people who will be making reactivation calls. Each caller logs
        in with their own email.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          No callers added yet. Use “Add caller” to invite the people making
          calls.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {m.first_name} {m.last_name}
                  </span>
                  {m.is_active ? (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={
                  pending && togglingId === m.id
                    ? true
                    : !m.is_active && atLimit
                }
                onClick={() => onToggle(m)}
                className={
                  m.is_active
                    ? 'text-destructive hover:text-destructive'
                    : 'text-accent hover:text-accent'
                }
              >
                {pending && togglingId === m.id
                  ? 'Saving…'
                  : m.is_active
                    ? 'Deactivate'
                    : 'Reactivate'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
