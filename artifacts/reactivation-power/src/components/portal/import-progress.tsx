// @ts-nocheck

import { useEffect, useState } from 'react'

/**
 * The "N / total" progress bar shown while a list upload runs. Shared by the
 * contacts and campaign-lead uploads so both feel like the same feature.
 */
export function ImportProgress({
  total,
  done,
  label,
}: {
  total: number
  done: boolean
  label: string
}) {
  const [pct, setPct] = useState(4)
  useEffect(() => {
    if (done) {
      setPct(100)
      return
    }
    // Ease toward ~92% while the server works so the bar never looks stuck;
    // completion snaps it to 100.
    const id = window.setInterval(() => {
      setPct((p) => (p >= 92 ? p : p + Math.max(0.6, (92 - p) * 0.08)))
    }, 120)
    return () => window.clearInterval(id)
  }, [done])
  const shown = Math.round((pct / 100) * total)
  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-4xl font-bold tabular-nums text-foreground">
        {done ? total : Math.min(shown, total)}
        <span className="text-xl font-semibold text-muted-foreground">
          {' '}
          / {total}
        </span>
      </p>
      <div
        className="h-3 w-full max-w-md overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Upload progress"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {done ? 'All set.' : 'Adding contacts to your list…'}
      </p>
    </div>
  )
}
