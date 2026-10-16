'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, HelpCircle, Pencil } from 'lucide-react'
import {
  setTeamMemberActive,
  updateTeamMember,
} from '@/app/actions/reactivation'
import { MAX_STAFF, type Participant } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/reactivation/phone-input'
import { AddCallerDialog } from '@/components/reactivation/add-caller-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function TeamManager({
  members,
  entityLabel,
}: {
  members: Participant[]
  entityLabel: string
}) {
  const router = useRouter()
  const [helpOpen, setHelpOpen] = useState(false)
  const [editing, setEditing] = useState<Participant | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [pending, startTransition] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const activeCount = members.filter((m) => m.is_active).length
  const atLimit = activeCount >= MAX_STAFF

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setEditError(null)
    setEditSubmitting(true)
    const fd = new FormData(e.currentTarget)
    fd.set('memberId', editing.id)
    const res = await updateTeamMember(fd)
    setEditSubmitting(false)
    if (res?.error) {
      setEditError(res.error)
      return
    }
    setEditing(null)
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

        <AddCallerDialog entityLabel={entityLabel} activeCount={activeCount} />
      </div>

      {/* Edit caller */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null)
            setEditError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit caller</DialogTitle>
            <DialogDescription>
              Update their name, email, or phone. They sign in with whatever
              name and email is saved here.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              key={editing.id}
              onSubmit={onEdit}
              className="flex flex-col gap-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ed-first">First name</Label>
                  <Input
                    id="ed-first"
                    name="firstName"
                    defaultValue={editing.first_name}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ed-last">Last name</Label>
                  <Input
                    id="ed-last"
                    name="lastName"
                    defaultValue={editing.last_name}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ed-email">Email address</Label>
                <Input
                  id="ed-email"
                  name="email"
                  type="email"
                  defaultValue={editing.email}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ed-phone">
                  Phone{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <PhoneInput
                  id="ed-phone"
                  name="phone"
                  defaultValue={editing.phone ?? ''}
                />
              </div>
              {editError ? (
                <p className="text-sm text-destructive">{editError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <p className="mt-2 text-sm text-muted-foreground">
        Add the people who will be making reactivation calls. Each caller logs
        in with their own email.{' '}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="font-medium text-accent underline underline-offset-2 hover:opacity-80"
        >
          Not sure how to do this? Click here
        </button>
      </p>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="size-5 text-accent" />
              Managing your callers
            </DialogTitle>
            <DialogDescription>
              A quick guide to adding, editing, and removing the people who
              make calls.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 text-sm text-foreground">
            <section className="flex flex-col gap-2">
              <h4 className="font-semibold">To add a caller</h4>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
                <li>
                  Click the{' '}
                  <span className="font-medium text-foreground">
                    “Add caller”
                  </span>{' '}
                  button at the top of this card (or “Add Staff Member” on the
                  Training page — same thing).
                </li>
                <li>
                  Enter their first name, last name, and email address. A phone
                  number is optional.
                </li>
                <li>
                  Click{' '}
                  <span className="font-medium text-foreground">
                    “Add caller”
                  </span>{' '}
                  to save. They’ll appear in the list below as{' '}
                  <span className="font-medium text-foreground">Active</span>.
                </li>
              </ol>
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="font-semibold">How your caller signs in</h4>
              <p className="text-muted-foreground">
                Your caller goes to the login screen and enters the same first
                name, last name, and email you used here. They’ll automatically
                see your {entityLabel}’s training, scripts, and call list —
                there’s no password to set up.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="font-semibold">To fix a name, email, or phone</h4>
              <p className="text-muted-foreground">
                Click{' '}
                <span className="font-medium text-foreground">“Edit”</span>{' '}
                next to their name, change what you need, and save. Callers can
                also update their own details from the Settings page.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="font-semibold">To remove a caller</h4>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
                <li>Find their name in the list below.</li>
                <li>
                  Click{' '}
                  <span className="font-medium text-foreground">
                    “Deactivate”
                  </span>{' '}
                  next to their name. They’ll no longer be able to sign in.
                </li>
                <li>
                  Changed your mind? Click{' '}
                  <span className="font-medium text-foreground">
                    “Reactivate”
                  </span>{' '}
                  to turn their access back on.
                </li>
              </ol>
            </section>

            <p className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground">
              You can have up to{' '}
              <span className="font-medium text-foreground">
                {MAX_STAFF} active callers
              </span>{' '}
              at a time. Deactivating someone frees up a spot for a new caller.
            </p>
          </div>

          <Button onClick={() => setHelpOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>

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
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEditError(null)
                    setEditing(m)
                  }}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
