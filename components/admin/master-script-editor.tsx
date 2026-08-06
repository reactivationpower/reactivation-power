'use client'

import { useState, useTransition } from 'react'
import { updateMasterScript } from '@/app/actions/reactivation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ReactivationScript } from '@/lib/types'

export function MasterScriptEditor({
  script,
  slots,
}: {
  script: ReactivationScript
  slots: string[]
}) {
  const [body, setBody] = useState(script.body)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Live slot detection as the admin types
  const liveSlots = Array.from(
    new Set(
      Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map(
        (m) => m[1],
      ),
    ),
  )

  function save(formData: FormData) {
    formData.set('id', script.id)
    formData.set('body', body)
    startTransition(async () => {
      await updateMasterScript(formData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <form action={save} className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            name="title"
            defaultValue={script.title}
            className="max-w-sm font-semibold"
            aria-label="Script title"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              name="statusToggle"
              defaultChecked={script.status === 'live'}
              onCheckedChange={(v) => {
                const input = document.querySelector<HTMLInputElement>(
                  'input[name="status"]',
                )
                if (input) input.value = v ? 'live' : 'draft'
              }}
            />
            Live for participants
          </label>
          <input type="hidden" name="status" defaultValue={script.status} />
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Write the full call script. Insert a placeholder anywhere
          niche-specific wording should go, like{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {'{{offer_details}}'}
          </code>
          . These placeholders are filled automatically on calls:{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {'{{contact_first_name}}'}
          </code>{' '}
          and{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {'{{contact_full_name}}'}
          </code>{' '}
          (the contact),{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {'{{caller_name}}'}
          </code>{' '}
          (whoever is logged in and making the call), and{' '}
          <code className="rounded bg-muted px-1 py-0.5">
            {'{{practice_name}}'}
          </code>{' '}
          (the account owner&apos;s practice).
        </p>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={22}
          className="mt-4 font-mono text-sm leading-relaxed"
          aria-label="Master script body"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Detected slots:
          </span>
          {liveSlots.length === 0 ? (
            <span className="text-sm text-muted-foreground">none</span>
          ) : (
            liveSlots.map((slot) => (
              <Badge key={slot} variant="outline" className="font-mono">
                {slot}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save Script'}
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  )
}
