'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
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
import { PhoneInput } from '@/components/reactivation/phone-input'
import { RichTextEditor } from '@/components/reactivation/rich-text-editor'
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
  const [notes, setNotes] = useState(contact.notes ?? '')
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
    formData.set('notes', notes)
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
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      {/* Header: title on the left, Save on the right — no scrolling to find it */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
        <h2 className="text-lg font-semibold text-foreground">
          Contact Details
        </h2>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <Check className="size-4" />
              Saved
            </span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
          <Button type="submit" disabled={pending} size="sm">
            {pending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={contact.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <PhoneInput
              id="edit-phone"
              name="phone"
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
            <Label htmlFor="edit-complaint">
              Previously Treated For{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="edit-complaint"
              name="originalComplaint"
              placeholder="e.g. lower back pain"
              defaultValue={contact.original_complaint ?? ''}
            />
            <p className="text-xs text-muted-foreground">
              Fills the condition into the call script. Leave blank and the
              script uses a generic lead-in instead.
            </p>
          </div>
        </div>

        {/* Dropdowns stretch the full width of their column so long niche
            names don't get clipped */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Niche</Label>
            <Select
              value={nicheId}
              onValueChange={(v) => v && setNicheId(v)}
              items={nicheItems}
            >
              <SelectTrigger aria-label="Niche" className="w-full">
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
              <SelectTrigger aria-label="Pipeline stage" className="w-full">
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
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <RichTextEditor
            id="edit-notes"
            initialValue={contact.notes}
            onChange={setNotes}
            placeholder="Anything the caller should know — preferences, family, what they mentioned last time…"
          />
        </div>

        <label className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 text-sm">
          <span>
            <span className="block font-medium text-foreground">
              Do Not Call
            </span>
            <span className="block text-xs text-muted-foreground">
              {dnc
                ? 'On — excluded from every queue and list'
                : 'Off — eligible for the call queue'}
            </span>
          </span>
          <Switch checked={dnc} onCheckedChange={setDnc} />
        </label>
      </div>
    </form>
  )
}
