import { useEffect, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { Inbox, Megaphone, PhoneCall } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LeadsTable } from '@/components/lead-followup/leads-table'
import { LeadStatusBadge, RequestedTimeBadge } from '@/components/lead-followup/lead-bits'
import { formatPhone } from '@workspace/shared/phone'
import { LEAD_DISPOSITION_LABELS, isLongTermLeadCheckIn, timeAgo } from '@workspace/shared/lead-followup'
import { PORTAL_WIDTH } from '@/lib/portal-layout'

type QueueItem = { lead: any; campaign: any; reason: 'new' | 'requested' | 'due' }
type LeadDashboard = {
  campaigns: Array<{ id: string; name: string }>
  rows: Array<{ lead: any; campaign: any }>
  callsNow?: QueueItem[]
  inProgress?: QueueItem[]
  comingUp?: QueueItem[]
  callDetails?: Record<string, { createdAt: string; disposition: keyof typeof LEAD_DISPOSITION_LABELS; callerName: string | null }>
  callerNames?: Record<string, string>
  total: number
  page: number
  pageSize: number
  stats: { received: number; new: number; reached: number; booked: number }
  now: string
}

const officeTime = (date: string | Date) => new Date(date).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})

function QueueRow({ item, data, mode }: { item: QueueItem; data: LeadDashboard; mode: 'ready' | 'upcoming' | 'progress' }) {
  const { lead, campaign, reason } = item
  const last = data.callDetails?.[lead.id]
  const due = lead.nextDueAt ? new Date(lead.nextDueAt).getTime() : null
  const now = new Date(data.now).getTime()
  const soon = mode === 'upcoming' && due !== null && due - now <= 5 * 60_000 && due > now
  const overdue = mode === 'ready' && due !== null && now - due >= 60_000
  const reasonText = reason === 'requested' ? 'Confirm appointment' :
    lead.lastDisposition === 'callback_later' ? 'Requested callback' :
    reason === 'new' ? 'First call' :
    isLongTermLeadCheckIn(lead.submittedAt, new Date(due ?? data.now)) ?
      (lead.sourceSubmittedAt ? 'Two-month check-in' : 'Check-in') :
      `Attempt ${lead.unansweredAttempts + 1} · Automatic retry`
  const detailHref = `/portal/campaigns/${campaign.id}/leads/${lead.id}`
  return <li className="grid gap-3 border-b border-border px-4 py-4 last:border-0 lg:grid-cols-[minmax(155px,1.2fr)_minmax(160px,1fr)_minmax(145px,1fr)_minmax(145px,1fr)_minmax(145px,1fr)_auto] lg:items-center" data-testid={`queue-lead-${lead.id}`}>
    <div>
      <Link href={detailHref} className="font-semibold text-foreground hover:underline">{lead.firstName} {lead.lastName}</Link>
      <p className="text-xs text-muted-foreground">{formatPhone(lead.phone)}</p>
    </div>
    <div className="text-sm">
      <p className="font-medium text-foreground">{campaign.name}</p>
      <p className="text-xs text-muted-foreground">{lead.sourceSubmittedAt ? `Submitted ${officeTime(lead.sourceSubmittedAt)} · ${timeAgo(lead.sourceSubmittedAt, now)}` : 'Original submission date unknown'}</p>
    </div>
    <div><RequestedTimeBadge requestedAt={lead.requestedAt} requestedTime={lead.requestedTime} status={lead.status} /></div>
    <div className="text-sm">
      <LeadStatusBadge status={lead.status} />
      <p className="mt-1 font-medium text-foreground">{reasonText}</p>
    </div>
    <div className="text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{mode === 'progress' ? `Being called by ${data.callerNames?.[lead.callLeaseCallerId] ?? 'team member'}` : last ? `Last: ${officeTime(last.createdAt)}` : 'Not called yet'}</p>
      <p>{mode === 'progress' ? `Started ${officeTime(lead.callLeaseStartedAt)}` : last ? `${last.callerName ?? 'Team member'} · ${LEAD_DISPOSITION_LABELS[last.disposition] ?? last.disposition}` : null}</p>
      {mode === 'upcoming' && due !== null && <p className={soon ? 'mt-1 font-semibold text-accent' : 'mt-1 font-medium text-foreground'}>{soon ? 'Due in 5 minutes · ' : 'Next: '}{officeTime(lead.nextDueAt)}</p>}
      {mode === 'ready' && due !== null && <p className={overdue ? 'mt-1 font-semibold text-amber-700' : 'mt-1 font-medium text-accent'}>{overdue ? `Overdue · ${officeTime(lead.nextDueAt)}` : `Due now · ${officeTime(lead.nextDueAt)}`}</p>}
    </div>
    <div>{mode === 'ready' ? <Button render={<Link href={`${detailHref}/call`} />} nativeButton={false} size="sm" className="gap-2 whitespace-nowrap"><PhoneCall className="size-4" />Call Now</Button> :
      mode === 'upcoming' ? <Button render={<Link href={detailHref} />} nativeButton={false} variant="outline" size="sm">View details</Button> :
      <span className="text-xs font-semibold text-muted-foreground">Call in progress</span>}</div>
  </li>
}

export default function LeadsPage() {
  const searchParams = new URLSearchParams(useSearch())
  // Legacy /portal/leads (and unknown view values) still open the call queue.
  const view = searchParams.get('view') === 'all' ? 'leads' : 'calls'
  const viewHref = (target: 'calls' | 'all') => {
    const params = new URLSearchParams(searchParams)
    params.set('view', target)
    return `/portal/leads?${params.toString()}`
  }
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
      <Link href={viewHref('calls')} data-testid="link-lead-view-calls" aria-current={view === 'calls' ? 'page' : undefined} className={`px-4 py-3 text-sm font-semibold ${view === 'calls' ? 'border-b-2 border-accent text-foreground' : 'text-muted-foreground'}`}>Calls Now ({data.callsNow?.length ?? 0})</Link>
      <Link href={viewHref('all')} data-testid="link-lead-view-all" aria-current={view === 'leads' ? 'page' : undefined} className={`px-4 py-3 text-sm font-semibold ${view === 'leads' ? 'border-b-2 border-accent text-foreground' : 'text-muted-foreground'}`}>All Leads</Link>
    </nav>
    {view === 'calls' ? <>
      <section aria-label="Ready to call" className="mt-7">
        <h2 className="text-xl font-semibold text-foreground">Ready to call</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only new leads, pending appointment confirmations, and follow-ups due now. Callbacks take priority over retries.</p>
        {outsideHours && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Outside office calling hours (9 AM–6 PM Eastern). Calls will be ready when calling hours begin.</p>}
        {!data.callsNow?.length ? <p className="mt-4 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No calls are due right now. Scheduled leads appear below when their time comes.</p> : <ul className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          {data.callsNow.map(item => <QueueRow key={item.lead.id} item={item} data={data} mode="ready" />)}
        </ul>}
      </section>
      <section aria-label="In progress" className="mt-8">
        <h2 className="text-xl font-semibold text-foreground">In Progress ({data.inProgress?.length ?? 0})</h2>
        <p className="mt-1 text-sm text-muted-foreground">Calls in progress are reserved for one caller. If a browser closes unexpectedly, its reservation expires within two minutes.</p>
        {!data.inProgress?.length ? <p className="mt-3 text-sm text-muted-foreground">Nobody is calling a lead right now.</p> : <ul className="mt-4 overflow-hidden rounded-lg border border-border bg-card">{data.inProgress.map(item => <QueueRow key={item.lead.id} item={item} data={data} mode="progress" />)}</ul>}
      </section>
      <section aria-label="Calls upcoming" className="mt-8">
        <h2 className="text-xl font-semibold text-foreground">Calls Upcoming</h2>
        <p className="mt-1 text-sm text-muted-foreground">These leads stay visible, but are not due for a call yet.</p>
        {!data.comingUp?.length ? <p className="mt-4 text-sm text-muted-foreground">Nothing scheduled yet.</p> : <ul className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          {data.comingUp.map(item => <QueueRow key={item.lead.id} item={item} data={data} mode="upcoming" />)}
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