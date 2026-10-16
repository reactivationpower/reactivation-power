'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { updateMyProfile } from '@/app/actions/reactivation'
import type { Participant } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/reactivation/phone-input'

/** Any signed-in user (owner or caller) edits their own name / email / phone. */
export function MyProfileForm({ participant }: { participant: Participant }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await updateMyProfile(formData)
      if (res?.error) {
        setError(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    })
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="me-first">First name</Label>
          <Input
            id="me-first"
            name="firstName"
            defaultValue={participant.first_name}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="me-last">Last name</Label>
          <Input
            id="me-last"
            name="lastName"
            defaultValue={participant.last_name}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="me-email">Email address</Label>
          <Input
            id="me-email"
            name="email"
            type="email"
            defaultValue={participant.email}
            required
          />
          <p className="text-xs text-muted-foreground">
            This is the email you type to sign in.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="me-phone">
            Phone{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <PhoneInput
            id="me-phone"
            name="phone"
            defaultValue={participant.phone ?? ''}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Saved
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  )
}
