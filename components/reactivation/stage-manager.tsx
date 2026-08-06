'use client'

import { useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  createStage,
  deleteStage,
  moveStage,
} from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PipelineStage } from '@/lib/types'

export function StageManager({ stages }: { stages: PipelineStage[] }) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('name', name)
      const res = await createStage(formData)
      if (res?.error) setError(res.error)
      else setNewName('')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="overflow-hidden rounded-lg border border-border bg-card">
        {stages.map((stage, i) => (
          <li
            key={stage.id}
            className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                {i + 1}
              </span>
              <span className="font-medium text-foreground">{stage.name}</span>
              {stage.is_default && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Default
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending || i === 0}
                onClick={() => startTransition(() => moveStage(stage.id, 'up'))}
                aria-label={`Move ${stage.name} up`}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending || i === stages.length - 1}
                onClick={() =>
                  startTransition(() => moveStage(stage.id, 'down'))
                }
                aria-label={`Move ${stage.name} down`}
              >
                <ArrowDown className="size-4" />
              </Button>
              {!stage.is_default && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete stage "${stage.name}"?`)) {
                      startTransition(async () => {
                        await deleteStage(stage.id)
                      })
                    }
                  }}
                  aria-label={`Delete ${stage.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New stage name"
          className="max-w-xs"
          aria-label="New stage name"
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
        <Button
          onClick={handleAdd}
          disabled={pending || !newName.trim()}
          variant="outline"
          className="gap-2"
        >
          <Plus className="size-4" />
          Add Stage
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
