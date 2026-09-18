'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil, Phone } from 'lucide-react'
import { setOfficePhone } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  initialPhone: string | null
}

/** Format up to 10 US digits as (555) 555-1234 while typing. */
function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function OfficePhoneForm({ initialPhone }: Props) {
  const [editing, setEditing] = useState(!initialPhone)
  const [phone, setPhone] = useState(maskPhone(initialPhone ?? ''))
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    startSaving(async () => {
      const formData = new FormData()
      formData.set('officePhone', phone)
      const result = await setOfficePhone(formData)
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
        <Phone className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {phone || 'No office number set'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-1 flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Edit office number"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Phone className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={phone}
          onChange={(e) => setPhone(maskPhone(e.target.value))}
          placeholder="(555) 555-1234"
          inputMode="tel"
          className="h-9 w-44"
          aria-label="Office callback number"
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
          disabled={saving}
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
        Auto-fills into the voicemail script as the callback number.
      </p>
    </div>
  )
}
