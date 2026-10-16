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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'

export function NewParticipantButton({
  owners,
  defaultOpen = false,
}: {
  owners: { id: string; name: string }[]
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [parentId, setParentId] = useState<string>('none')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (parentId !== 'none') fd.set('parentId', parentId)
    const res = await createParticipant(fd)
    setPending(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    setParentId('none')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="size-4" />
        Add Participant
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add participant</DialogTitle>
          <DialogDescription>
            Create a login for a new participant. Their email is their key to
            the training portal — only registered emails can get in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="np-first">First name</Label>
              <Input id="np-first" name="firstName" required placeholder="Jane" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="np-last">Last name</Label>
              <Input id="np-last" name="lastName" required placeholder="Smith" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="np-email">Email address</Label>
            <Input
              id="np-email"
              name="email"
              type="email"
              required
              placeholder="jane@example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="np-phone">Phone</Label>
            <Input id="np-phone" name="phone" placeholder="(555) 555-5555" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Account type</Label>
            <Select
              value={parentId}
              onValueChange={(v) => setParentId(v ?? 'none')}
              items={[
                { value: 'none', label: 'Standalone participant' },
                ...owners.map((o) => ({
                  value: o.id,
                  label: `Staff under ${o.name}`,
                })),
              ]}
            >
              <SelectTrigger aria-label="Account type">
                <SelectValue placeholder="Standalone participant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standalone participant</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    Staff under {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create participant'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
