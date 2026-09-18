// @ts-nocheck

import { useTransition } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { viewAsParticipant } from '@/app/actions/admin-view-as'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/lib/notify'

/** Opens this client's portal as them (super admins only). */
export function ViewAsButton({ participantId, name }: { participantId: string; name: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      data-testid="button-view-as"
      onClick={() =>
        startTransition(async () => {
          try {
            await viewAsParticipant(participantId)
          } catch (err) {
            notifyError('Could not open portal', err instanceof Error ? err.message : 'Something went wrong.')
          }
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
      View portal as {name}
    </Button>
  )
}
