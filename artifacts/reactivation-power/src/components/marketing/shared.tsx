import { type ReactNode } from 'react'

export const pct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(1)}%`)
export const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-US')
export function money(cents: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(cents / 100) }
  catch { return `${(cents / 100).toFixed(2)} ${currency}` }
}
export function attrLabel(a: any) {
  if (!a) return 'None recorded'
  const parts = [a.source ?? 'unknown', a.campaign, a.channel].filter(Boolean)
  return parts.join(' / ')
}

/** Accessible horizontal bar list: visual bars are aria-hidden, values are real text. */
export function BarList({ label, rows, max }: { label: string; rows: { name: string; value: number; note?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <figure aria-label={label} className="space-y-2">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground" title={r.name}>{r.name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full origin-left rounded-full bg-primary transition-transform duration-500" style={{ transform: `scaleX(${Math.min(1, r.value / top)})` }} />
            </span>
            <span className="tabular-nums font-medium">{num(r.value)}{r.note ? <span className="ml-1 text-xs font-normal text-muted-foreground">{r.note}</span> : null}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export function Table({ caption, head, children, empty }: { caption: string; head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">{head.map((h, i) => <th key={h} scope="col" className={`py-2 pr-3 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{empty ? <tr><td colSpan={head.length} className="py-6 text-center text-muted-foreground">No rows for these filters.</td></tr> : children}</tbody>
      </table>
    </div>
  )
}
export const td = 'py-2 pr-3 text-right tabular-nums'
