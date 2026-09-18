// @ts-nocheck

import { useState, useTransition } from 'react'
import { Copy, Link2, Loader2, MoreHorizontal, Plus, UserMinus, UserCheck } from 'lucide-react'

import {
  getTeamInviteLink,
  inviteTeamMember,
  setTeamMemberActive,
  updateTeamMember,
  type AdminUser,
  type InviteResult,
} from '@/app/actions/admin-team'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { notifyDone, notifyError } from '@/lib/notify'
import { useRouter } from '@/hooks/use-router'

const ROLE_LABEL = { super_admin: 'Super admin', sales_rep: 'Sales rep' } as const

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

export function TeamManager({
  members,
  currentUserId,
}: {
  members: AdminUser[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [linkDialog, setLinkDialog] = useState<{ email: string; link: string; emailError?: string | null } | null>(null)
  const [pending, startTransition] = useTransition()

  function onInvited(result: InviteResult) {
    setInviteOpen(false)
    router.refresh()
    if (result.emailSent) {
      notifyDone('Invite sent', `${result.user.email} will receive an email with a link to set their password.`)
    } else if (result.inviteLink) {
      setLinkDialog({ email: result.user.email, link: result.inviteLink, emailError: result.emailError })
    }
  }

  function patch(member: AdminUser, fields: Record<string, string>, done: string) {
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', member.id)
        for (const [k, v] of Object.entries(fields)) fd.set(k, v)
        await updateTeamMember(fd)
        notifyDone(done)
        router.refresh()
      } catch (err) {
        notifyError('Could not update', errorMessage(err))
        router.refresh()
      }
    })
  }

  function setActive(member: AdminUser, active: boolean) {
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', member.id)
        fd.set('active', String(active))
        await setTeamMemberActive(fd)
        notifyDone(active ? 'Account reactivated' : 'Account deactivated', member.email)
        router.refresh()
      } catch (err) {
        notifyError('Could not update', errorMessage(err))
      }
    })
  }

  function inviteLink(member: AdminUser) {
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', member.id)
        const { link } = await getTeamInviteLink(fd)
        setLinkDialog({ email: member.email, link })
      } catch (err) {
        notifyError('Could not create link', errorMessage(err))
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {members.length} admin account{members.length === 1 ? '' : 's'}
        </p>
        <Button onClick={() => setInviteOpen(true)} data-testid="button-invite">
          <Plus className="size-4" />
          Invite team member
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-40">Commission rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No admin accounts yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const isSelf = m.id === currentUserId
                return (
                  <TableRow key={m.id} data-testid={`row-member-${m.email}`} className={m.active ? '' : 'opacity-60'}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {m.name ?? m.email}
                          {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                        </span>
                        {m.name ? <span className="text-xs text-muted-foreground">{m.email}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        aria-label={`Role for ${m.email}`}
                        className={selectClass}
                        value={m.role}
                        disabled={pending || isSelf}
                        onChange={(e) => patch(m, { role: e.target.value }, 'Role updated')}
                      >
                        <option value="super_admin">{ROLE_LABEL.super_admin}</option>
                        <option value="sales_rep">{ROLE_LABEL.sales_rep}</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <RateEditor
                        value={m.defaultCommissionRate}
                        disabled={pending}
                        onSave={(rate) => patch(m, { rate: String(rate) }, 'Commission rate updated')}
                      />
                    </TableCell>
                    <TableCell>
                      {!m.active ? (
                        <Badge variant="destructive">Deactivated</Badge>
                      ) : m.confirmedAt && m.lastSignInAt ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Invited</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(m.lastSignInAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${m.email}`} disabled={pending} />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => inviteLink(m)}>
                            <Link2 className="size-4" />
                            {m.lastSignInAt ? 'Password reset link' : 'Copy invite link'}
                          </DropdownMenuItem>
                          {!isSelf ? (
                            <>
                              <DropdownMenuSeparator />
                              {m.active ? (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setActive(m, false)}
                                >
                                  <UserMinus className="size-4" />
                                  Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setActive(m, true)}>
                                  <UserCheck className="size-4" />
                                  Reactivate
                                </DropdownMenuItem>
                              )}
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={onInvited} />

      <Dialog open={Boolean(linkDialog)} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite link for {linkDialog?.email}</DialogTitle>
            <DialogDescription>
              {linkDialog?.emailError
                ? `The invite email could not be sent (${linkDialog.emailError}). Share this one-time link instead — it lets them set a password and sign in.`
                : 'Share this one-time link. It lets them set a password and sign in.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={linkDialog?.link ?? ''} className="font-mono text-xs" data-testid="input-invite-link" />
            <Button
              variant="outline"
              onClick={async () => {
                if (linkDialog && (await copyText(linkDialog.link))) notifyDone('Link copied')
                else notifyError('Could not copy', 'Select the link and copy it manually.')
              }}
            >
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RateEditor({
  value,
  disabled,
  onSave,
}: {
  value: number
  disabled: boolean
  onSave: (rate: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : String(value)
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={100}
        step={0.5}
        className="h-9 w-20"
        aria-label="Default commission rate"
        value={shown}
        disabled={disabled}
        onFocus={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const n = Number(draft)
          if (Number.isFinite(n) && n !== value) onSave(n)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  )
}

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvited: (result: InviteResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<'super_admin' | 'sales_rep'>('sales_rep')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They will get an email with a link to set their password. Sales reps see payments and customers only; super admins see everything.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            setError(null)
            startTransition(async () => {
              try {
                onInvited(await inviteTeamMember(fd))
              } catch (err) {
                setError(errorMessage(err))
              }
            })
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" name="email" type="email" required autoFocus data-testid="input-invite-email" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input id="invite-name" name="name" data-testid="input-invite-name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                name="role"
                className={selectClass}
                value={role}
                onChange={(e) => setRole(e.target.value as 'super_admin' | 'sales_rep')}
                data-testid="select-invite-role"
              >
                <option value="sales_rep">{ROLE_LABEL.sales_rep}</option>
                <option value="super_admin">{ROLE_LABEL.super_admin}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-rate">Default commission rate (%)</Label>
              <Input
                id="invite-rate"
                name="rate"
                type="number"
                min={0}
                max={100}
                step={0.5}
                defaultValue={role === 'sales_rep' ? 10 : 0}
                data-testid="input-invite-rate"
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-testid="button-send-invite">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Send invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
