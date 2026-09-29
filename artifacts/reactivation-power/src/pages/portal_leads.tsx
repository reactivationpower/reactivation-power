import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Inbox, Megaphone, PhoneCall } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LeadsTable } from '@/components/lead-followup/leads-table'
import { isLongTermLeadCheckIn } from '@workspace/shared/lead-followup'
import { PORTAL_WIDTH } from '@/lib/portal-layout'

type LeadDashboard = {
  campaigns: Array<{ id: string; name: string }>
  rows: Array<{ lead: any; campaign: any }>
  callsNow?: Array<{ lead: any; campaign: any; reason: 'new' | 'requested' | 'due' }>
  comingUp?: Array<{ lead: any; campaign: any; reason: 'requested' | 'due' }>
  total: number
  page: number
  pageSize: number
  stats: { received: number; new: number; reached: number; booked: number }
  now: string
}

export default function LeadsPage() {
  const [view, setView] = useState<'calls' | 'leads'>('calls')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [campaign, setCampaign] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = usePageData<LeadDashboard>('/portal/leads', {
    search, campaign, status, page: String(page),
  })
  // Scheduled calls become ready as time passes, even if the caller leaves
  // this page open. Also pick up leads received in another session.
  useEffect(() => {
    if (view !== 'calls') return
    const refresh = () => { if (!document.hidden) void reload() }
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [view, reload])
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  if (!data) return <PageLoading />
  const officeHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(data.now)))
  const outsideHours = officeHour < 9 || officeHour >= 18

  return <div className={`${PORTAL_WIDTH} py-8`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Leads</h1>
        <p className="mt-1 text-muted-foreground">Call the leads who are due, or view every lead across your campaigns.</p>
      </div>
      <Button render={<Link href="/portal/campaigns" />} nativeButton={false} variant="outline" className="gap-2">
        <Megaphone className="size-4" />Manage campaigns
      </Button>
    </div>
    <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="lead-stats">
      {([
        ['Leads received', data.stats.received],
        ['New', data.stats.new],
        ['Reached', data.stats.reached],
        ['Booked', data.stats.booked],
      ] as const).map(([label, count]) => <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{count}</dd>
      </div>)}
    </dl>
    <nav aria-label="Lead views" className="mt-8 flex gap-2 border-b border-border">
      <button type="button" onClick={() => setView('calls')} aria-current={view === 'calls' ? 'page' : undefined} className={`px-4 py-3 text-sm font-semibold ${view === 'calls' ? 'border-b-2 border-accent text-foreground' : 'text-muted-foreground'}`}>Calls Now ({data.callsNow?.length ?? 0})</button>
      <button type="button" onClick={() => setView('leads')} aria-current={view === 'leads' ? 'page' : undefined} className={`px-4 py-3 text-sm font-semibold ${view === 'leads' ? 'border-b-2 border-accent text-foreground' : 'text-muted-foreground'}`}>All Leads</button>
    </nav>
    {view === 'calls' ? <>
      <section aria-label="Ready to call" className="mt-7">
        <h2 className="text-xl font-semibold text-foreground">Ready to call</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only new leads, pending appointment confirmations, and follow-ups due now. Callbacks take priority over retries.</p>
        {outsideHours && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Outside office calling hours (9 AM–6 PM Eastern). Calls will be ready when calling hours begin.</p>}
        {!data.callsNow?.length ? <p className="mt-4 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No calls are due right now. Scheduled leads appear below when their time comes.</p> : <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {data.callsNow.map(({ lead, campaign, reason }) => <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-semibold text-foreground">{lead.firstName} {lead.lastName}</p>
              <p className="text-sm text-muted-foreground">{campaign.name} · {reason === 'requested' ? 'Confirm appointment' : reason === 'new' ? 'New inquiry — first call' : lead.lastDisposition === 'callback_later' ? 'Requested callback' : isLongTermLeadCheckIn(lead.submittedAt, new Date(data.now)) ? lead.sourceSubmittedAt ? 'Two-month check-in' : 'Check-in' : `Follow-up attempt ${lead.unansweredAttempts + 1}`}</p>
            </div>
            <Button render={<Link href={`/portal/campaigns/${campaign.id}/leads/${lead.id}/call`} />} nativeButton={false} size="sm" className="gap-2"><PhoneCall className="size-4" />Open script</Button>
          </li>)}
        </ul>}
      </section>
      <section aria-label="Coming up" className="mt-8">
        <h2 className="text-xl font-semibold text-foreground">Coming up</h2>
        <p className="mt-1 text-sm text-muted-foreground">These leads stay visible, but are not due for a call yet.</p>
        {!data.comingUp?.length ? <p className="mt-4 text-sm text-muted-foreground">Nothing scheduled yet.</p> : <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {data.comingUp.map(({ lead, campaign, reason }) => <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div><Link href={`/portal/campaigns/${campaign.id}/leads/${lead.id}`} className="font-medium text-foreground hover:underline">{lead.firstName} {lead.lastName}</Link><p className="text-sm text-muted-foreground">{campaign.name} · {reason === 'requested' ? 'Confirmation retry' : lead.lastDisposition === 'callback_later' ? 'Requested callback' : lead.nextDueAt && isLongTermLeadCheckIn(lead.submittedAt, new Date(lead.nextDueAt)) ? lead.sourceSubmittedAt ? 'Two-month check-in' : 'Check-in' : 'Scheduled follow-up'}</p></div>
            {lead.nextDueAt ? <time dateTime={lead.nextDueAt} className="text-sm text-muted-foreground">{new Date(lead.nextDueAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</time> : <span className="text-sm text-muted-foreground">Next office calling hours</span>}
          </li>)}
        </ul>}
      </section>
    </> : <>
    <div className="mt-7 flex flex-wrap items-end gap-3">
      <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1) }} className="flex min-w-56 flex-1 gap-2" role="search">
        <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, phone, email, or campaign" aria-label="Search leads" maxLength={100} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Campaign
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={campaign} onChange={(event) => { setCampaign(event.target.value); setPage(1) }}>
          <option value="">All campaigns</option>
          {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Status
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="parked">Parked</option>
        </select>
      </label>
    </div>
    {data.stats.received === 0 && data.campaigns.length === 0 ? <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <Inbox className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 font-medium text-foreground">No leads yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Create a campaign to receive your first leads.</p>
      <Link href="/portal/campaigns/new" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Create campaign</Link>
    </div> : <>
      <p className="mt-5 text-sm text-muted-foreground" aria-live="polite">
        {data.total} matching lead{data.total === 1 ? '' : 's'}
      </p>
      <LeadsTable rows={data.rows} nowMs={new Date(data.now).getTime()} showCampaign emptyText="No leads match these filters." />
      {data.total > data.pageSize && <div className="mt-4 flex items-center justify-end gap-3">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {data.page} of {Math.ceil(data.total / data.pageSize)}</span>
        <Button variant="outline" disabled={page >= Math.ceil(data.total / data.pageSize)} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>}
    </>}
    </>}
  </div>
}