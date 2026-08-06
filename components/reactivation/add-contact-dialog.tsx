'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createContact } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Niche } from '@/lib/types'

export function AddContactDialog({ niches }: { niches: Niche[] }) {
  const [open, setOpen] = useState(false)
  const [nicheId, setNicheId] = useState<string>('none')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const nicheItems = [
    { value: 'none', label: 'No niche' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]

  function submit(formData: FormData) {
    formData.set('nicheId', nicheId)
    setError(null)
    startTransition(async () => {
      const res = await createContact(formData)
      if (res?.error) setError(res.error)
      else {
        setOpen(false)
        setNicheId('none')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="size-4" />
        Add Contact
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add a former client or patient to your reactivation list.
              They&apos;ll be due for a call immediately.
            </DialogDescription>
          </DialogHeader>
          <form action={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                name="name"
                placeholder="Patient or client name"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                name="phone"
                type="tel"
                placeholder="(555) 555-5555"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-email">Email (optional)</Label>
              <Input
                id="contact-email"
                name="email"
                type="email"
                placeholder="name@example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Niche (optional)</Label>
              <Select
                value={nicheId}
                onValueChange={(v) => v && setNicheId(v)}
                items={nicheItems}
              >
                <SelectTrigger aria-label="Niche">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nicheItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-notes">Notes (optional)</Label>
              <Textarea
                id="contact-notes"
                name="notes"
                rows={2}
                placeholder="Anything useful before the call"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Adding...' : 'Add Contact'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
