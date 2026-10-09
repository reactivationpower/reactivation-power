import { createContext, useContext, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const Ctx = createContext<() => void>(() => {})

export function StrategyCallProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [, navigate] = useLocation()
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  const opt = 'w-full rounded-md border px-4 py-3 text-center font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  return (
    <Ctx.Provider value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="modal-strategy-call">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Who is scheduling this call?</DialogTitle>
            <DialogDescription>Strategy calls are held with healthcare providers and practice staff.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <button type="button" className={`${opt} border-accent bg-accent text-accent-foreground hover:bg-accent/90`} onClick={() => go('/strategy-call/schedule')} data-testid="button-modal-provider">
              I'm a provider
            </button>
            <button type="button" className={`${opt} border-accent bg-card text-accent hover:bg-accent/10`} onClick={() => go('/strategy-call/providers-only')} data-testid="button-modal-patient">
              I'm a patient
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

export function StrategyCallButton({ className = '', children = 'Schedule Strategy Call', testId = 'button-schedule-strategy-call' }: { className?: string; children?: ReactNode; testId?: string }) {
  const open = useContext(Ctx)
  return (
    <button type="button" onClick={open} data-testid={testId} aria-haspopup="dialog"
      className={`whitespace-nowrap rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:px-6 md:py-3 md:text-base ${className}`}>
      {children}
    </button>
  )
}
