'use client'

import { useMemo, useState, useTransition } from 'react'
import { Eye } from 'lucide-react'
import { saveScriptSection } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Niche, ScriptSection } from '@/lib/types'

export function NicheSectionsEditor({
  niches,
  slots,
  sections,
  masterBody,
}: {
  niches: Niche[]
  slots: string[]
  sections: ScriptSection[]
  masterBody: string
}) {
  const activeNiches = niches.filter((n) => n.is_active)
  const [nicheId, setNicheId] = useState(activeNiches[0]?.id ?? '')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [savedSlot, setSavedSlot] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Content keyed by `${nicheId}:${slot}` with local edits layered on
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const savedContent = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sections) map.set(`${s.niche_id}:${s.slot_name}`, s.content)
    return map
  }, [sections])

  // Contact placeholders are filled at call time, not per niche
  const editableSlots = slots.filter((s) => s !== 'contact_first_name')

  function valueFor(slot: string): string {
    const key = `${nicheId}:${slot}`
    return drafts[key] ?? savedContent.get(key) ?? ''
  }

  function handleSave(slot: string) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('nicheId', nicheId)
      formData.set('slotName', slot)
      formData.set('content', valueFor(slot))
      await saveScriptSection(formData)
      setSavedSlot(slot)
      setTimeout(() => setSavedSlot(null), 2000)
    })
  }

  const previewText = useMemo(() => {
    return masterBody.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_m, slot: string) => {
        if (slot === 'contact_first_name') return 'Mary'
        const v = valueFor(slot)
        return v || `[${slot.replace(/_/g, ' ').toUpperCase()}]`
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterBody, nicheId, drafts, savedContent])

  if (activeNiches.length === 0) {
    return (
      <p className="text-muted-foreground">
        Add at least one active niche first.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={nicheId}
          onValueChange={(v) => v && setNicheId(v)}
          items={activeNiches.map((n) => ({ value: n.id, label: n.name }))}
        >
          <SelectTrigger className="w-56" aria-label="Select niche">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeNiches.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="size-4" />
          Preview merged script
        </Button>
      </div>

      {editableSlots.length === 0 ? (
        <p className="text-muted-foreground">
          The master script has no placeholders yet. Add slots like{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {'{{offer_details}}'}
          </code>{' '}
          to the master script first.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {editableSlots.map((slot) => (
            <div
              key={slot}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  {'{{' + slot + '}}'}
                </h3>
                <div className="flex items-center gap-2">
                  {savedSlot === slot && (
                    <span className="text-sm text-success">Saved</span>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSave(slot)}
                    disabled={pending}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <Textarea
                value={valueFor(slot)}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [`${nicheId}:${slot}`]: e.target.value,
                  }))
                }
                rows={3}
                placeholder={`${activeNiches.find((n) => n.id === nicheId)?.name ?? ''} wording for ${slot.replace(/_/g, ' ')}`}
                className="mt-3 leading-relaxed"
                aria-label={`Content for ${slot}`}
              />
            </div>
          ))}
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Preview —{' '}
              {activeNiches.find((n) => n.id === nicheId)?.name ?? 'Niche'}
            </DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {previewText}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
