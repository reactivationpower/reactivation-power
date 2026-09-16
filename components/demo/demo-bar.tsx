'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Eye, RefreshCw, Sparkles } from 'lucide-react'
import {
  refreshDemoIfStale,
  resetDemo,
  switchDemoView,
} from '@/app/actions/demo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface DemoIdentity {
  id: string
  label: string
  role: 'owner' | 'staff'
}

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/i

/** Where the presenter lands after a rebuild when their current page can't survive one. */
const AFTER_REBUILD_HOME = '/portal/dialer'

/**
 * A rebuild gives every patient (and their calls) brand-new ids, so any page
 * addressed by a record id (patient detail, call screen, caller analytics)
 * would 404 on refresh. Those pages hand off to the dialer; everything else
 * simply reloads in place.
 */
function pathSurvivesRebuild(pathname: string) {
  return !UUID_SEGMENT.test(pathname)
}

/**
 * Thin strip above the portal header, visible ONLY inside the demo account.
 * Presenter can hop between the owner and the four callers (to show the
 * narrower caller view) and rebuild the whole data set with one click.
 *
 * When the server says the data is from a previous Eastern day (`stale`),
 * the bar asks for one refresh through the locked action and re-renders.
 * Page rendering itself never rebuilds.
 */
export function DemoBar({
  currentId,
  identities,
  seededLabel,
  stale = false,
}: {
  currentId: string
  identities: DemoIdentity[]
  seededLabel: string
  stale?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const refreshRequested = useRef(false)

  function showRebuiltData(message: string) {
    setStatus(message)
    if (pathSurvivesRebuild(pathname)) {
      router.refresh()
    } else {
      router.replace(AFTER_REBUILD_HOME)
    }
    setTimeout(() => setStatus(null), 4000)
  }

  useEffect(() => {
    if (!stale || refreshRequested.current) return
    refreshRequested.current = true
    setStatus('Refreshing demo data for today…')
    startTransition(async () => {
      const res = await refreshDemoIfStale()
      if ('error' in res && res.error) {
        setStatus(res.error)
        return
      }
      if (res.rebuilt) {
        showRebuiltData('Demo data refreshed. Every date is now relative to today.')
      } else {
        setStatus(null)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per stale flag; pathname is read at that moment
  }, [stale])

  function onSwitch(id: string) {
    if (!id || id === currentId) return
    startTransition(async () => {
      await switchDemoView(id)
    })
  }

  function onReset() {
    setConfirmOpen(false)
    setStatus('Rebuilding demo data…')
    startTransition(async () => {
      const res = await resetDemo()
      if ('error' in res && res.error) {
        setStatus(res.error)
        return
      }
      showRebuiltData('Demo data reset. Every date is now relative to today.')
    })
  }

  return (
    <div className="border-b border-accent/30 bg-accent/10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          Demo account
        </span>
        <span className="hidden text-muted-foreground sm:inline">
          {seededLabel}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Eye className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Viewing as</span>
            <Select
              value={currentId}
              onValueChange={(v) => onSwitch(String(v ?? ''))}
              disabled={pending}
              items={identities.map((p) => ({
                value: p.id,
                label: `${p.label} · ${p.role === 'owner' ? 'Owner' : 'Caller'}`,
              }))}
            >
              <SelectTrigger className="h-8 w-56 bg-card text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {identities.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                    <span className="ml-1 text-muted-foreground">
                      · {p.role === 'owner' ? 'Owner' : 'Caller'}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-2 bg-card"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
          >
            <RefreshCw
              className={pending ? 'size-4 animate-spin' : 'size-4'}
              aria-hidden="true"
            />
            Reset demo data
          </Button>
        </div>

        {status ? (
          <p
            role="status"
            className="basis-full text-xs text-muted-foreground sm:basis-auto"
          >
            {status}
          </p>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the demo data?</DialogTitle>
            <DialogDescription>
              This rebuilds Ridgeline Chiropractic from scratch: all 100
              patients, every call, follow-up, appointment, and training
              record, with every date relative to today. Anything changed
              during this demo is discarded. Takes a few seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onReset}>Reset now</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
