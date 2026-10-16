'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createNiche, deleteNiche, updateNiche } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SECTOR_LABELS, type Niche, type Sector } from '@/lib/types'

const SECTOR_ORDER: Sector[] = ['healthcare', 'home_services']

export function NicheManager({ niches }: { niches: Niche[] }) {
  const [newName, setNewName] = useState('')
  const [newSector, setNewSector] = useState<Sector>('healthcare')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('name', name)
      formData.set('sector', newSector)
      const res = await createNiche(formData)
      if (res?.error) setError(res.error)
      else setNewName('')
    })
  }

  function handleToggle(niche: Niche, active: boolean) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', niche.id)
      formData.set('isActive', String(active))
      await updateNiche(formData)
    })
  }

  function handleRename(niche: Niche, name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === niche.name) return
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', niche.id)
      formData.set('name', trimmed)
      await updateNiche(formData)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this niche? Its script sections will be removed.'))
      return
    startTransition(async () => {
      await deleteNiche(id)
    })
  }

  const sectors = SECTOR_ORDER.filter((s) =>
    niches.some((n) => (n.sector ?? 'healthcare') === s),
  )

  return (
    <div className="flex flex-col gap-4">
      {sectors.map((sector) => {
        const group = niches.filter(
          (n) => (n.sector ?? 'healthcare') === sector,
        )
        return (
          <div key={sector} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <h2 className="font-semibold text-foreground">
                {SECTOR_LABELS[sector]} — Services / Niches
              </h2>
              <p className="text-sm text-muted-foreground">
                Participants in the {SECTOR_LABELS[sector].toLowerCase()}{' '}
                sector pick one of these to auto-fill the script. Inactive
                niches are hidden from participants.
              </p>
            </div>
            <ul>
              {group.map((niche) => (
                <li
                  key={niche.id}
                  className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0"
                >
                  <Input
                    defaultValue={niche.name}
                    className="max-w-xs"
                    aria-label={`Niche name: ${niche.name}`}
                    onBlur={(e) => handleRename(niche, e.target.value)}
                  />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Switch
                        checked={niche.is_active}
                        onCheckedChange={(v) => handleToggle(niche, v)}
                        disabled={pending}
                      />
                      {niche.is_active ? 'Active' : 'Inactive'}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(niche.id)}
                      aria-label={`Delete ${niche.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {niches.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-5 py-6 text-center text-sm text-muted-foreground">
          No niches yet — add your first one below.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New niche name (e.g. Plumbing)"
          className="max-w-xs"
          aria-label="New niche name"
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <Select
          value={newSector}
          onValueChange={(v) => setNewSector((v as Sector) ?? 'healthcare')}
          items={SECTOR_ORDER.map((s) => ({
            value: s,
            label: SECTOR_LABELS[s],
          }))}
        >
          <SelectTrigger aria-label="Sector" className="w-44">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            {SECTOR_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {SECTOR_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} disabled={pending || !newName.trim()} className="gap-2">
          <Plus className="size-4" />
          Add Niche
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
