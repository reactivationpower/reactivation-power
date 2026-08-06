'use client'

import { useState, useTransition } from 'react'
import { updateContact } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ContactWithMeta } from '@/lib/data/reactivation'
import type { Niche, PipelineStage } from '@/lib/types'

export function ContactEditor({
  contact,
  stages,
  niches,
}: {
  contact: ContactWithMeta
  stages: PipelineStage[]
  niches: Niche[]
}) {
  const [nicheId, setNicheId] = useState(contact.niche_id ?? 'none')
  const [stageId, setStageId] = useState(contact.stage_id ?? '')
  const [dnc, setDnc] = useState(contact.do_not_call)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const nicheItems = [
    { value: 'none', label: 'No niche' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]
  const stageItems = stages.map((s) => ({ value: s.id, label: s.name }))

  function submit(formData: FormData) {
    formData.set('id', contact.id)
    formData.set('nicheId', nicheId)
    if (stageId) formData.set('stageId', stageId)
    formData.set('doNotCall', String(dnc))
    setError(null)
    startTransition(async () => {
      const res = await updateContact(formData)
      if (res?.error) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    })
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" name="name" defaultValue={contact.name} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-phone">Phone</Label>
          <Input
            id="edit-phone"
            name="phone"
            type="tel"
            defaultValue={contact.phone}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            name="email"
            type="email"
            defaultValue={contact.email ?? ''}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Niche</Label>
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
          <Label>Pipeline Stage</Label>
          <Select
            value={stageId}
            onValueChange={(v) => v && setStageId(v)}
            items={stageItems}
          >
            <SelectTrigger aria-label="Pipeline stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Do Not Call</Label>
          <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={dnc} onCheckedChange={setDnc} />
            {dnc ? 'On — excluded from all queues' : 'Off'}
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-notes">Notes</Label>
        <Textarea
          id="edit-notes"
          name="notes"
          rows={3}
          defaultValue={contact.notes ?? ''}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save Changes'}
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  )
}
