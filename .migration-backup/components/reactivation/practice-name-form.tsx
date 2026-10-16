'use client'

import { useState, useTransition } from 'react'
import { Building2, Check, Loader2, Pencil } from 'lucide-react'
import { setPracticeName } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  initialName: string | null
  /** "practice" for healthcare, "business" for home services etc. */
  entityLabel?: 'practice' | 'business'
}

export function PracticeNameForm({ initialName, entityLabel = 'practice' }: Props) {
  const [editing, setEditing] = useState(!initialName)
  const [name, setName] = useState(initialName ?? '')
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    startSaving(async () => {
      const formData = new FormData()
      formData.set('practiceName', name)
      const result = await setPracticeName(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {name || `No ${entityLabel} name set`}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-1 flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Edit ${entityLabel} name`}
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Your ${entityLabel} name`}
          className="h-9 w-52"
          aria-label={`${entityLabel === 'business' ? 'Business' : 'Practice'} name`}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              save()
            }
          }}
        />
        <Button
          size="sm"
          className="gap-1.5"
          disabled={saving || !name.trim()}
          onClick={save}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Save
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {`Auto-fills into your call scripts as the ${entityLabel} name.`}
      </p>
    </div>
  )
}
