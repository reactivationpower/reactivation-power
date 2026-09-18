'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createCourse } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SECTOR_LABELS, type Sector } from '@/lib/types'

const SECTOR_OPTIONS: Sector[] = ['healthcare', 'home_services']

export function NewCourseButton() {
  const [open, setOpen] = useState(false)
  const [sector, setSector] = useState<Sector>('healthcare')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('sector', sector)
    startTransition(async () => {
      const result = await createCourse(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        if (result.id) router.push(`/admin/courses/${result.id}`)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="size-4" />
        New course
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a course</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="course-title">Title</Label>
            <Input
              id="course-title"
              name="title"
              placeholder="Pay-Per-Lead Training"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="course-description">Description</Label>
            <Textarea
              id="course-description"
              name="description"
              placeholder="Everything your office needs to succeed..."
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Industry sector</Label>
            <Select
              value={sector}
              onValueChange={(v) => setSector((v as Sector) ?? 'healthcare')}
              items={SECTOR_OPTIONS.map((s) => ({
                value: s,
                label: SECTOR_LABELS[s],
              }))}
            >
              <SelectTrigger aria-label="Industry sector">
                <SelectValue placeholder="Healthcare" />
              </SelectTrigger>
              <SelectContent>
                {SECTOR_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls which niches and scripts participants see in the portal.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating...' : 'Create course'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
