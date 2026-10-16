'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteContact } from '@/app/actions/reactivation'
import { cn } from '@/lib/utils'

/**
 * Deletes a contact and everything tied to it (call history + follow-ups
 * cascade in the database). Two visual variants:
 *  - "detail": full button used on the contact profile page; redirects
 *    back to the portal after a successful delete.
 *  - "row": compact icon button used in the contacts table; the server
 *    action revalidates the list so the row drops out on its own.
 */
export function DeleteContactButton({
  contactId,
  contactName,
  variant = 'detail',
  onDeleted,
}: {
  contactId: string
  contactName: string
  variant?: 'detail' | 'row'
  onDeleted?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const confirmed = window.confirm(
      `Delete ${contactName}? This permanently removes the contact and their call history. This can't be undone.`,
    )
    if (!confirmed) return
    startTransition(async () => {
      const res = await deleteContact(contactId)
      if (res?.error) {
        window.alert(res.error)
        return
      }
      onDeleted?.()
      if (variant === 'detail') {
        router.push('/portal/contacts')
      } else {
        router.refresh()
      }
    })
  }

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={`Delete ${contactName}`}
        className="inline-flex items-center justify-center rounded-md border border-input bg-card p-1.5 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-transparent px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50',
      )}
    >
      <Trash2 className="size-4" />
      {pending ? 'Deleting...' : 'Delete Contact'}
    </button>
  )
}
