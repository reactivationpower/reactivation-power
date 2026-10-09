import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { affiliateLogout, getAffiliateDashboard, logAffiliateNavigation } from '@/app/actions/affiliates'
import { toast } from 'sonner'
import { PrivacyNote, ReportView, btn2Cls, btnCls } from '@/components/affiliates/shared'

const VIEW: Record<string, 'payments' | 'payouts' | 'practices' | 'dashboard'> = { periods: 'dashboard', practices: 'practices', payments: 'payments', payouts: 'payouts' }

export default function AffiliatePortalPage() {
  const [, nav] = useLocation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['affiliate-dashboard'], queryFn: getAffiliateDashboard, retry: false, staleTime: 0, refetchOnMount: 'always', refetchInterval: 60000 })
  const logged = useRef(false)
  useEffect(() => { if (q.data && !logged.current) { logged.current = true; logAffiliateNavigation({ view: 'dashboard' }).catch(() => undefined) } }, [q.data])
  const out = useMutation({ mutationFn: affiliateLogout, onSuccess: () => { qc.clear(); nav('/affiliates/access') } })

  if (q.isLoading) return <div className="mx-auto max-w-5xl space-y-4 p-6">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
  if (q.isError || !q.data) return (
    <div className="mx-auto max-w-md p-10 text-center space-y-4" data-testid="status-signed-out">
      <h1 className="text-2xl font-semibold">Sign in with your inbox</h1>
      <p className="text-sm text-muted-foreground">Your session is missing or expired. Request a fresh access link.</p>
      <div className="flex justify-center gap-2"><Link href="/affiliates/access" className={btnCls}>Request access</Link><button className={btn2Cls} onClick={() => q.refetch()}>Retry</button></div>
    </div>
  )
  const r = q.data
  const refUrl = `https://patientpipeline.app/strategy-call?ref=${encodeURIComponent(r.affiliate.referral_code)}`
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <img src="/images/patient-pipeline-logo.png" alt="Patient Pipeline" className="h-8 w-auto rounded bg-white" />
            <div><p className="text-sm font-semibold" data-testid="text-partner">{r.affiliate.business_name}</p><p className="text-xs text-muted-foreground">Referral code <span className="font-mono">{r.affiliate.referral_code}</span></p></div>
          </div>
          <button data-testid="button-logout" className={btn2Cls} onClick={() => out.mutate()} disabled={out.isPending}>Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your referral link</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input readOnly data-testid="text-referral-url" onFocus={(e) => e.currentTarget.select()} value={refUrl} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
            <button data-testid="button-copy-referral" className={btn2Cls} onClick={async () => { try { await navigator.clipboard.writeText(refUrl); toast.success('Referral link copied') } catch { toast.error('Copy failed; select the link manually') } }}>Copy</button>
            <a data-testid="link-open-referral" href={refUrl} target="_blank" rel="noopener noreferrer" className={btn2Cls}>Open</a>
          </div>
        </div>
        <ReportView report={r}
          onTab={(t) => { if (t !== 'practices') logAffiliateNavigation({ view: VIEW[t] }).catch(() => undefined) }}
          onPracticeView={(id) => logAffiliateNavigation({ view: 'practices', customerId: id }).catch(() => undefined)} />
        <PrivacyNote />
      </main>
    </div>
  )
}
