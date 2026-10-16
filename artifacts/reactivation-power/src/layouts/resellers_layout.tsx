import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { AuthenticatedSession } from '@/components/authenticated-session'
import { Toaster } from '@/components/ui/sonner'
import { adminLogout } from '@/app/actions/admin-auth'
import { getWorkspace } from '@/app/actions/resellers'
import { btn2Cls } from '@/components/affiliates/shared'
import { QueryError, Skeleton } from '@/components/resellers/ui'
import { cn } from '@/lib/utils'

export default function ResellersLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedSession kind="admin"><Shell>{children}</Shell></AuthenticatedSession>
}

function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation()
  const me = useQuery({ queryKey: ['reseller-me'], queryFn: () => getWorkspace('', 1), staleTime: 30000 })
  const manager = me.data?.actor.role === 'reseller_manager'
  const nav: [string, string, boolean][] = [['/resellers', 'Prospects', true], ['/resellers/onboarding', 'Payment details', manager], ['/demo', 'Product demo', true], ['/training-demo', 'Training demo', true]]
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <img src="/images/patient-pipeline-logo.png" alt="Patient Pipeline" className="h-8 w-auto rounded bg-white" />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Reseller workspace</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.filter((n) => n[2]).map(([href, label]) => (
              <Link key={href} href={href} data-testid={`nav-${label.toLowerCase().replace(/\W+/g, '-')}`} className={cn('rounded-md px-3 py-1.5 font-medium', loc === href ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>{label}</Link>
            ))}
            <button className={btn2Cls} data-testid="button-signout" onClick={async () => { try { await adminLogout() } catch { /* server redirects */ } window.location.assign('/admin-login') }}>Sign out</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {me.isLoading ? <Skeleton /> : me.isError ? (
          <div className="space-y-3"><QueryError error={me.error} onRetry={() => me.refetch()} busy={me.isFetching} /><Link href="/admin-login" className="text-sm underline">Sign in</Link></div>
        ) : children}
      </main>
      <Toaster id="resellers" position="top-right" richColors closeButton />
    </div>
  )
}
