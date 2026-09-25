import { Link } from 'wouter'
import { BarChart3 } from 'lucide-react'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

interface Caller {
  id: string; name: string; isOwner: boolean; active: boolean; qualified: boolean
  calls: number; conversations: number; booked: number; confirmed: number
  rescheduled: number; answerRate: number; closeRate: number; voicemails: number; doNotCall: number
}

export default function LeadAnalyticsPage() {
  const { data, loading, error } = usePageData<{ callers: Caller[]; minimumConversations: number }>('/portal/leads/analytics')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  if (!data) return null
  const totals = data.callers.reduce((s, c) => ({ calls: s.calls + c.calls, conversations: s.conversations + c.conversations, booked: s.booked + c.booked }), { calls: 0, conversations: 0, booked: 0 })
  return (
    <div className={`${PORTAL_WIDTH} flex flex-col gap-6 py-8`}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="flex items-center gap-3 text-3xl font-bold"><BarChart3 className="size-7 text-accent" />Analytics</h1>
          <p className="mt-2 text-muted-foreground">Lead Follow-Up · All-time caller performance across your campaigns.</p></div>
        <Link href="/portal/settings" className="text-sm font-medium text-accent hover:underline">Manage callers</Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(totals).map(([label, value]) => <div key={label} className="rounded-lg border bg-card p-5">
          <p className="text-sm capitalize text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
        </div>)}
      </div>
      <section className="rounded-lg border bg-card">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">Caller rankings</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ranked by close rate after {data.minimumConversations} booking conversations, then bookings and conversations. The owner and inactive callers are included.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40"><tr>{['Rank', 'Caller', 'Calls', 'Conversations', 'Booked', 'Confirmed', 'Rescheduled', 'Answer rate', 'Close rate', 'Voicemails', 'Do not call'].map(h => <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{data.callers.map((c, i) => <tr key={c.id} className="border-t">
              <td className="px-4 py-3">{c.qualified ? i + 1 : '—'}</td>
              <th scope="row" className="min-w-44 px-4 py-3 font-medium">{c.name}
                <span className="block text-xs font-normal text-muted-foreground">{c.isOwner ? 'Owner' : !c.active ? 'Inactive / former caller' : 'Caller'}{!c.qualified ? ' · Building sample' : ''}</span>
              </th>
              {[c.calls, c.conversations, c.booked, c.confirmed, c.rescheduled, `${c.answerRate}%`, `${c.closeRate}%`, c.voicemails, c.doNotCall].map((v, j) => <td key={j} className="px-4 py-3 tabular-nums">{v}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {!totals.calls && <p className="border-t p-5 text-sm text-muted-foreground">No lead calls logged yet. Your callers will appear here as they start calling.</p>}
      </section>
      <p className="text-sm text-muted-foreground">Counts reflect logged call outcomes, not unique leads. Answer rate is conversations ÷ calls. Close rate is booked ÷ booking conversations; confirmations and reschedules are shown separately and excluded from both sides of close rate, so they do not count as additional bookings.</p>
    </div>
  )
}