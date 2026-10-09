import { useState } from 'react'
import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import type { ReportInput } from '@workspace/shared/marketing-analytics'
import { getMarketingReport, getMarketingSetup } from '@/app/actions/marketing'
import { Banner, Empty, ErrorBox, Field, Skeleton, btn, btn2, card, fmt, inp, viewerTz } from '@/components/leads/ui'
import { BarList, Table, money, num, pct, td } from '@/components/marketing/shared'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const initial = (): ReportInput => ({ from: iso(new Date(Date.now() - 30 * 86400000)), to: iso(new Date()), timezone: viewerTz || 'America/New_York', model: 'first', observationDays: 90, includeExcluded: false })
const clean = (f: ReportInput): ReportInput => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined)) as ReportInput

export default function AdminMarketingAnalyticsPage() {
  const [draft, setDraft] = useState<ReportInput>(initial)
  const [applied, setApplied] = useState<ReportInput>(initial)
  const setup = useQuery({ queryKey: ['marketing', 'setup'], queryFn: getMarketingSetup })
  const q = useQuery({ queryKey: ['marketing', 'report', applied], queryFn: () => getMarketingReport(clean(applied)) })
  const s = setup.data
  const d = q.data
  const up = (k: keyof ReportInput, v: any) => setDraft({ ...draft, [k]: v })
  const campaigns = [...new Set<string>((s?.links ?? []).map((l: any) => l.campaign))]
  const channels = [...new Set<string>((s?.links ?? []).map((l: any) => l.channel))]
  const funnels = [...new Set<string>((s?.pages ?? []).map((p: any) => p.funnel))]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Marketing</p>
          <h1 className="text-2xl font-semibold">Marketing analytics</h1>
          <p className="text-sm text-muted-foreground">{s && !s.superAdmin ? 'Scoped to leads assigned to you.' : 'All internal sales sources.'} Visitors are estimated browsers, not verified people.</p>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">{q.isFetching ? 'Refreshing report...' : d ? `Queried ${fmt(d.freshAt, applied.timezone)} · Last recorded outcome ${d.lastOutcomeAt?fmt(d.lastOutcomeAt,applied.timezone):'none'}` : ''}</p>
      </header>

      <form className={card + ' grid gap-3 sm:grid-cols-2 lg:grid-cols-4'} onSubmit={(e) => { e.preventDefault(); setApplied(draft) }} aria-label="Report filters">
        <Field label="From"><input type="date" className={inp} value={draft.from ?? ''} onChange={(e) => up('from', e.target.value)} data-testid="input-from" /></Field>
        <Field label="To"><input type="date" className={inp} value={draft.to ?? ''} onChange={(e) => up('to', e.target.value)} data-testid="input-to" /></Field>
        <Field label="Timezone (IANA)"><input className={inp} value={draft.timezone ?? ''} onChange={(e) => up('timezone', e.target.value)} data-testid="input-timezone" /></Field>
        <Field label="Attribution model"><select className={inp} value={draft.model} onChange={(e) => up('model', e.target.value)} data-testid="select-model"><option value="first">First touch</option><option value="last">Last touch (includes direct)</option></select></Field>
        <Field label="Source"><select className={inp} value={draft.source ?? ''} onChange={(e) => up('source', e.target.value)} data-testid="select-source"><option value="">All sources</option>{(s?.sources ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.name}{x.active ? '' : ' (archived)'}</option>)}</select></Field>
        <Field label="Campaign"><select className={inp} value={draft.campaign ?? ''} onChange={(e) => up('campaign', e.target.value)}><option value="">All campaigns</option>{campaigns.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Channel"><select className={inp} value={draft.channel ?? ''} onChange={(e) => up('channel', e.target.value)}><option value="">All channels</option>{channels.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Page visited"><select className={inp} value={draft.page ?? ''} onChange={(e) => up('page', e.target.value)}><option value="">Any page</option>{(s?.pages ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
        <Field label="Funnel"><select className={inp} value={draft.funnel ?? ''} onChange={(e) => up('funnel', e.target.value)}><option value="">All funnels</option>{funnels.map((f) => <option key={f}>{f}</option>)}</select></Field>
        <Field label="Observation window (days)"><input type="number" min={1} max={365} className={inp} value={draft.observationDays ?? 90} onChange={(e) => up('observationDays', Number(e.target.value))} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!draft.includeExcluded} onChange={(e) => up('includeExcluded', e.target.checked)} />Include excluded traffic</label>
        <div className="flex items-end gap-2"><button className={btn} data-testid="button-apply">Run report</button><button type="button" className={btn2} onClick={() => { const i = initial(); setDraft(i); setApplied(i) }}>Reset</button></div>
      </form>

      {q.isLoading ? <Skeleton rows={8} /> : q.isError || !d ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : d.totals.visitors === 0 && d.contacts.length === 0 && d.revenue.length === 0 ? (
        <Empty title="No observed traffic in this window" body="Widen the date range, clear filters, or include excluded traffic." />
      ) : (
        <>
          <section aria-labelledby="ns-h" className="grid gap-4 md:grid-cols-2">
            <h2 id="ns-h" className="sr-only">North star rates</h2>
            {[['Visitor to booked call', d.totals.visitorToBookedRate, `${num(d.totals.bookings)} bookings from ${num(d.totals.visitors)} visitors`],
              ['Lead to customer', d.totals.leadToCustomerRate, `${num(d.totals.customers)} customers from ${num(d.totals.leads)} leads`]].map(([l, r, sub]: any) => (
              <div key={l} className={card + ' border-primary/30 bg-primary/5'}>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{l}</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums">{pct(r)}</p>
                <p className="text-sm text-muted-foreground">{sub}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" aria-label="Totals">
            {[['Visitors', d.totals.visitors], ['Sessions', d.totals.sessions], ['Page views', d.totals.pageViews], ['CTA clicks', d.totals.ctaClicks], ['CTA visitors', d.totals.ctaVisitors], ['Form starts', d.totals.formStarts], ['Leads', d.totals.leads], ['Customers', d.totals.customers]].map(([l, v]: any) => (
              <div key={l} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold tabular-nums">{num(v)}</p></div>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-5">
            <section className={card + ' space-y-4 lg:col-span-3'} aria-labelledby="funnel-h">
              <div><h2 id="funnel-h" className="font-semibold">Ordered funnel</h2><p className="text-xs text-muted-foreground">Each step counts entry cohorts that reached it after the previous step, within {d.filters.observationDays} days. {d.filters.model === 'first' ? 'First' : 'Last'}-touch attribution.</p></div>
              <BarList label="Funnel counts by stage" max={d.funnel[0]?.count || 1} rows={d.funnel.map((f: any) => ({ name: f.label, value: f.count, note: pct(f.overallRate) }))} />
              <Table caption="Funnel stages with denominators and dropoff" head={['Stage', 'Count', 'Of previous', 'Step rate', 'Overall', 'Dropoff']}>
                {d.funnel.map((f: any) => <tr key={f.label}><th scope="row" className="py-2 pr-3 text-left font-medium">{f.label}</th><td className={td}>{num(f.count)}</td><td className={td}>{num(f.denominator)}</td><td className={td}>{pct(f.precedingRate)}</td><td className={td}>{pct(f.overallRate)}</td><td className={td}>{f.dropoff ? `-${num(f.dropoff)}` : '0'}</td></tr>)}
              </Table>
            </section>
            <section className={card + ' space-y-3 lg:col-span-2'} aria-labelledby="rev-h">
              <h2 id="rev-h" className="font-semibold">Revenue by currency</h2>
              <p className="text-xs text-muted-foreground">Currencies are never combined. Net is gross minus refunds and disputes.</p>
              {d.revenue.length === 0 ? <p className="text-sm text-muted-foreground">No attributed payments in this window.</p> : d.revenue.map((r: any) => (
                <dl key={r.currency} className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                  <dt className="col-span-2 text-xs font-semibold uppercase tracking-wider">{r.currency}</dt>
                  <dt className="text-muted-foreground">Gross</dt><dd className="text-right tabular-nums">{money(r.gross, r.currency)}</dd>
                  <dt className="text-muted-foreground">Refunded</dt><dd className="text-right tabular-nums">-{money(r.refunded, r.currency)}</dd>
                  <dt className="text-muted-foreground">Disputed</dt><dd className="text-right tabular-nums">-{money(r.disputed, r.currency)}</dd>
                  <dt className="border-t border-border pt-1 font-medium">Net</dt><dd className="border-t border-border pt-1 text-right font-semibold tabular-nums">{money(r.net, r.currency)}</dd>
                </dl>
              ))}
            </section>
          </div>

          <section className={card + ' space-y-3'} aria-labelledby="src-h">
            <h2 id="src-h" className="font-semibold">Sources, campaigns and channels</h2>
            <Table caption="Attribution by source" head={['Source / campaign / channel', 'Visitors', 'Leads', 'Bookings', 'Customers', 'Visitor to lead', 'Net collected']} empty={!d.sources.length}>
              {[...d.sources].sort((a: any, b: any) => b.visitors - a.visitors).map((r: any, i: number) => (
                <tr key={i}><th scope="row" className="py-2 pr-3 text-left font-medium">{r.source}<span className="block text-xs font-normal text-muted-foreground">{[r.campaign, r.channel].filter(Boolean).join(' / ') || 'No campaign'}</span></th>
                  <td className={td}>{num(r.visitors)}</td><td className={td}>{num(r.leads)}</td><td className={td}>{num(r.bookings)}</td><td className={td}>{num(r.customers)}</td><td className={td}>{pct(r.visitors ? r.leads / r.visitors : null)}</td><td className={td}>{r.revenue?.map((m:any)=><div key={m.currency}>{money(m.net,m.currency)}</div>)}</td></tr>
              ))}
            </Table>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className={card + ' space-y-3'} aria-labelledby="pg-h">
              <h2 id="pg-h" className="font-semibold">Pages</h2>
              <Table caption="Page views and clicks" head={['Page', 'Views', 'Clicks', 'Clicks per view']} empty={!d.pages.length}>
                {[...d.pages].sort((a: any, b: any) => b.views - a.views).map((p: any) => (
                  <tr key={p.page}><th scope="row" className="py-2 pr-3 text-left font-medium">{s?.pages?.find((x: any) => x.id === p.page)?.label ?? p.page}</th><td className={td}>{num(p.views)}</td><td className={td}>{num(p.clicks)}</td><td className={td}>{pct(p.views ? p.clicks / p.views : null)}</td></tr>
                ))}
              </Table>
            </section>
            <section className={card + ' space-y-3'} aria-labelledby="vid-h">
              <div><h2 id="vid-h" className="font-semibold">Video diagnostics</h2><p className="text-xs text-muted-foreground">Per session and placement. Unique seconds watched of a 240 second walkthrough. Not a funnel step.</p></div>
              {d.videoAggregates?.map((v:any)=><p key={`${v.video}:${v.placement}`} className="text-xs text-muted-foreground">{v.placement}: {num(v.viewers)} observed browsers, {Math.round(v.uniqueSeconds)} distinct content seconds summed across browsers (deduplicated across their sessions), {Math.round(v.elapsed)} active elapsed seconds.</p>)}
              <Table caption="Video watch diagnostics" head={['Video / placement', 'Plays', 'Unique sec', 'Watched', 'Furthest', 'Errors', 'Active elapsed', 'Repeat sec']} empty={!d.videos.length}>
                {d.videos.map((v: any) => (
                  <tr key={`${v.sessionId}${v.placement}${v.video}`}><th scope="row" className="py-2 pr-3 text-left font-medium">{v.video ?? 'video'}<span className="block text-xs font-normal text-muted-foreground">{v.placement ?? 'unknown placement'}</span></th>
                    <td className={td}>{num(v.plays)}</td><td className={td}>{Math.round(v.uniqueSeconds)}</td><td className={td}>{v.percent.toFixed(1)}%</td><td className={td}>{Math.round(v.furthest)}s</td><td className={td}>{num(v.errors)}</td><td className={td}>{Math.round(v.elapsed)}s</td><td className={td}>{Math.round(v.repeatSeconds)}s</td></tr>
                ))}
              </Table>
            </section>
          </div>

          <section className={card + ' space-y-3'} aria-labelledby="ct-h">
            <h2 className="font-semibold">Viewing and booking association</h2>
            <p className="text-sm text-muted-foreground">Association, not causation. Post-booking video views never count as pre-booking viewing. Missing telemetry is not proof someone did not watch.</p>
            <Table caption="Observed pre-booking viewing association" head={['Group','Visitors','Booked','Rate']}>
              {d.videoAssociation?.map((r:any)=><tr key={r.label}><th scope="row" className="text-left py-2">{r.label}{r.smallSample&&<span className="block text-xs text-muted-foreground">Small sample: fewer than 30 browsers</span>}</th><td className={td}>{num(r.visitors)}</td><td className={td}>{num(r.booked)}</td><td className={td}>{pct(r.rate)}</td></tr>)}
            </Table>
            <h2 id="ct-h" className="font-semibold">Contacts behind these conversions</h2>
            {d.contacts.length === 0 ? <p className="text-sm text-muted-foreground">No attributed leads you are authorized to see.</p> : (
              <ul className="flex flex-wrap gap-2">{d.contacts.map((c: any) => (
                <li key={c.id}><Link href={`/admin/leads/${c.id}`} className={btn2 + ' px-3 py-1 text-xs'} data-testid={`link-contact-${c.id}`}>{c.name || 'Unnamed lead'}</Link></li>
              ))}</ul>
            )}
          </section>
          <Banner kind="info"><span className="font-medium">How to read this: </span>{d.limitations}</Banner>
        </>
      )}
    </div>
  )
}
