'use client'

import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LeadForm } from '@/components/landing/lead-form'

interface LeadDialogProps {
  /** The button/link that opens the dialog */
  children: React.ReactElement
}

export function LeadDialog({ children }: LeadDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={children} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Get started — it takes 30 seconds
          </DialogTitle>
          <DialogDescription>
            Fill this out, then pick a time for your call on the next page.
          </DialogDescription>
        </DialogHeader>
        <LeadForm />
      </DialogContent>
    </Dialog>
  )
}
