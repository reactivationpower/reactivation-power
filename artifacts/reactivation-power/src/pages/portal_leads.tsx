import { useState } from 'react'
import { Link } from 'wouter'
import { Inbox, Megaphone } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LeadsTable } from '@/components/lead-followup/leads-table'
import { PORTAL_WIDTH } from '@/lib/portal-layout'

type LeadDashboard = {
  campaigns: Array<{ id: string; name: string }>
  rows: Array<{ lead: any; campaign: any }>
  total: number
  page: number
  pageSize: number
  stats: { received: number; new: number; reached: number; booked: number }
  now: string
}

export default function LeadsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [campaign, setCampaign] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const { data, loading, error } = usePageData<LeadDashboard>('/portal/leads', {
    search, campaign, status, page: String(page),
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  if (!data) return <PageLoading />

  return <div className={`${PORTAL_WIDTH} py-8`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Leads</h1>
        <p className="mt-1 text-muted-foreground">Every lead across your campaigns, newest first.</p>
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
  </div>
}