import { type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { listSalesLeads } from '@/app/actions/sales-leads'

export const REFRESH_MS = 20000
export const inp = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
export const btn = 'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
export const btn2 = 'inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
export const card = 'rounded-xl border border-border bg-card p-5'

export const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone

export function fmt(iso: string | null | undefined, tz?: string | null) {
  if (!iso) return 'Not set'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Invalid date'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz || viewerTz, year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }).format(d)
  }
}

/** datetime-local value -> ISO string with explicit instant. */
export function localToIso(v: string) { return v ? new Date(v).toISOString() : undefined }

export function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong' }

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

const TONE: Record<string, string> = {
  Won: 'bg-success/15 text-success', 'Lost/Do Not Contact': 'bg-destructive/15 text-destructive',
  'Not Now': 'bg-muted text-muted-foreground', 'No-Show': 'bg-destructive/10 text-destructive',
  New: 'bg-accent text-accent-foreground',
}
export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone ?? TONE[String(children)] ?? 'bg-secondary text-secondary-foreground'}`}>{children}</span>
}

export function Banner({ kind, children }: { kind: 'warn' | 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = { warn: 'border-yellow-500/40 bg-yellow-500/10', error: 'border-destructive/40 bg-destructive/10 text-destructive', ok: 'border-success/40 bg-success/10', info: 'border-border bg-muted' }[kind]
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-2" data-testid="loading-skeleton">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
}

export function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="space-y-2"><Banner kind="error">{errMsg(error)}</Banner><button className={btn2} onClick={retry} data-testid="button-retry">Retry</button></div>
}

export function Empty({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-dashed border-border p-10 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>
}

export function LeadsTabs() {
  const [loc] = useLocation()
  const tabs = [['/admin/leads', 'Pipeline'], ['/admin/leads/import', 'Import'], ['/admin/leads/settings', 'Settings']]
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Leads sections">
      {tabs.map(([h, l]) => (
        <Link key={h} href={h} data-testid={`tab-leads-${l.toLowerCase()}`}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${loc === h ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</Link>
      ))}
    </nav>
  )
}

/** Shared dashboard query (team, settings, identity) with 20s refresh. */
export function useDashboard(input: Parameters<typeof listSalesLeads>[0] = {}) {
  return useQuery({ queryKey: ['sales-leads', 'list', input], queryFn: () => listSalesLeads(input), refetchInterval: REFRESH_MS, placeholderData: (p) => p })
}
