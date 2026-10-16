import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getMarketingAudit, getMarketingSetup, saveMarketingLink, saveMarketingPage, saveMarketingSettings, saveMarketingSource } from '@/app/actions/marketing'
import { Banner, Empty, ErrorBox, Field, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp } from '@/components/leads/ui'

const KEY = ['marketing', 'setup']
const ACTIVE = 'bg-success/15 text-success', ARCHIVED = 'bg-muted text-muted-foreground'
const linkUrl = (code: string) => `${window.location.origin}/api/m/${code}`

function useSave<T>(fn: (v: T) => Promise<any>, msg: string, done: () => void) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ['marketing'] }); done() }, onError: (e) => toast.error(errMsg(e)) })
}

function Audit({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['marketing', 'audit', id], queryFn: () => getMarketingAudit(id) })
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid={`audit-${id}`}>
      <div className="flex items-center justify-between"><p className="text-sm font-medium">Audit trail (latest 100)</p><button className={btn2 + ' px-2 py-1 text-xs'} onClick={onClose}>Close</button></div>
      {q.isLoading ? <Skeleton rows={2} /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <p className="text-xs text-muted-foreground">No audit entries.</p> : (
        <ol className="space-y-2">{q.data.map((a: any) => (
          <li key={a.id} className="text-xs"><span className="text-muted-foreground">{fmt(a.occurred_at)} · {a.entity} · actor {a.actor ?? 'system'}</span>
            <details className="mt-1"><summary className="cursor-pointer">Before and after</summary>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-card p-2">{JSON.stringify({ before: a.before_value, after: a.after_value }, null, 2)}</pre></details></li>
        ))}</ol>
      )}
    </div>
  )
}


export default function AdminLeadSourcesPage() {
  const q = useQuery({ queryKey: KEY, queryFn: getMarketingSetup })
  const [tab, setTab] = useState<'sources' | 'links' | 'pages' | 'settings'>('sources')
  const [audit, setAudit] = useState<string | null>(null)
  const [src, setSrc] = useState<any | null>(null)
  const [lnk, setLnk] = useState<any | null>(null)
  const [pg, setPg] = useState<any | null>(null)
  const [set, setSet] = useState<any | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const saveSrc = useSave(saveMarketingSource, 'Source saved', () => setSrc(null))
  const saveLnk = useSave(saveMarketingLink, 'Link saved', () => setLnk(null))
  const savePg = useSave(saveMarketingPage, 'Page saved', () => setPg(null))
  const saveSet = useSave(saveMarketingSettings, 'Settings saved', () => setSet(null))

  if (q.isLoading) return <Skeleton rows={6} />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const { sources, links, pages, settings, superAdmin } = q.data as { sources: any[]; links: any[]; pages: any[]; settings: any; superAdmin: boolean }
  const vis = (r: any) => showArchived || r.active
  const srcName = (id: string) => sources.find((s) => s.id === id)?.name ?? 'Unknown source'
  const activePages = pages.filter((p) => p.active)
  const copy = async (code: string) => { try { await navigator.clipboard.writeText(linkUrl(code)); toast.success('Link copied') } catch { toast.error('Copy failed. Select the link text instead.') } }
  const auditBtn = (id: string) => superAdmin && <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => setAudit(audit === id ? null : id)} data-testid={`button-audit-${id}`}>Audit</button>
  const toggle = (active: boolean, onClick: () => void, pending: boolean) => superAdmin && <button className={btn2 + ' px-2 py-1 text-xs'} disabled={pending} onClick={onClick}>{active ? 'Archive' : 'Restore'}</button>

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Marketing</p>
          <h1 className="text-2xl font-semibold">Lead sources</h1>
          <p className="text-sm text-muted-foreground">Sources, opaque tracking links, registered pages and attribution windows.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="checkbox-show-archived" />Show archived</label>
      </header>
      {!superAdmin && <Banner kind="info">Read-only. Only a super admin can create or change sources, links, pages and settings.</Banner>}
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Lead source sections">
        {(['sources', 'links', 'pages', 'settings'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined} data-testid={`tab-${t}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t} {t !== 'settings' && <span className="ml-1 text-xs tabular-nums text-muted-foreground">{({ sources, links, pages } as any)[t].filter((r: any) => r.active).length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'sources' && (
        <section className="space-y-3">
          {superAdmin && !src && <button className={btn} onClick={() => setSrc({ name: '', notes: '', active: true })} data-testid="button-new-source">New source</button>}
          {src && (
            <form className={card + ' grid gap-3 sm:grid-cols-2'} onSubmit={(e) => { e.preventDefault(); saveSrc.mutate({ ...(src.id && { id: src.id }), name: src.name.trim(), notes: src.notes, active: src.active }) }}>
              <Field label="Name"><input required maxLength={100} className={inp} value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} data-testid="input-source-name" /></Field>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={src.active} onChange={(e) => setSrc({ ...src, active: e.target.checked })} />Active</label>
              <div className="sm:col-span-2"><Field label="Notes"><textarea rows={2} maxLength={2000} className={inp} value={src.notes} onChange={(e) => setSrc({ ...src, notes: e.target.value })} /></Field></div>
              <div className="flex gap-2"><button className={btn} disabled={saveSrc.isPending || !src.name.trim()} data-testid="button-save-source">{saveSrc.isPending ? 'Saving...' : 'Save source'}</button><button type="button" className={btn2} onClick={() => setSrc(null)}>Cancel</button></div>
            </form>
          )}
          {sources.filter(vis).length === 0 ? <Empty title="No sources yet" body="A source groups the campaigns and channels that bring in practices." /> : sources.filter(vis).map((s) => (
            <div key={s.id} className={card + ' space-y-2'} data-testid={`source-${s.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-medium">{s.name} <Pill tone={s.active ? ACTIVE : ARCHIVED}>{s.active ? 'Active' : 'Archived'}</Pill></p>
                  {s.notes && <p className="text-sm text-muted-foreground">{s.notes}</p>}
                  <p className="text-xs text-muted-foreground">{links.filter((l) => l.source_id === s.id).length} links · created {fmt(s.created_at)}</p></div>
                <div className="flex flex-wrap gap-1.5">
                  {superAdmin && <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => setSrc({ id: s.id, name: s.name, notes: s.notes ?? '', active: s.active })}>Edit</button>}
                  {toggle(s.active, () => saveSrc.mutate({ id: s.id, name: s.name, notes: s.notes ?? '', active: !s.active }), saveSrc.isPending)}
                  {auditBtn(s.id)}
                </div>
              </div>
              {audit === s.id && <Audit id={s.id} onClose={() => setAudit(null)} />}
            </div>
          ))}
        </section>
      )}

      {tab === 'links' && (
        <section className="space-y-3">
          {superAdmin && !lnk && <button className={btn} disabled={!sources.some((s) => s.active) || !activePages.length} onClick={() => setLnk({ sourceId: sources.find((s) => s.active)?.id ?? '', campaign: '', channel: '', page: activePages[0]?.id ?? '', active: true })} data-testid="button-new-link">New link</button>}
          {lnk && (
            <form className={card + ' grid gap-3 sm:grid-cols-2'} onSubmit={(e) => { e.preventDefault(); saveLnk.mutate({ ...(lnk.id && { id: lnk.id }), sourceId: lnk.sourceId, campaign: lnk.campaign.trim(), channel: lnk.channel.trim(), page: lnk.page, active: lnk.active }) }}>
              <Field label="Source"><select className={inp} value={lnk.sourceId} onChange={(e) => setLnk({ ...lnk, sourceId: e.target.value })} data-testid="select-link-source">{sources.filter((s) => s.active || s.id === lnk.sourceId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Destination page"><select className={inp} value={lnk.page} onChange={(e) => setLnk({ ...lnk, page: e.target.value })} data-testid="select-link-page">{activePages.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.path})</option>)}</select></Field>
              <Field label="Campaign"><input required maxLength={100} className={inp} value={lnk.campaign} onChange={(e) => setLnk({ ...lnk, campaign: e.target.value })} data-testid="input-link-campaign" /></Field>
              <Field label="Channel"><input required maxLength={100} className={inp} value={lnk.channel} onChange={(e) => setLnk({ ...lnk, channel: e.target.value })} data-testid="input-link-channel" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lnk.active} onChange={(e) => setLnk({ ...lnk, active: e.target.checked })} />Active</label>
              <div className="flex gap-2 sm:col-span-2"><button className={btn} disabled={saveLnk.isPending || !lnk.campaign.trim() || !lnk.channel.trim() || !lnk.sourceId || !lnk.page} data-testid="button-save-link">{saveLnk.isPending ? 'Saving...' : 'Save link'}</button><button type="button" className={btn2} onClick={() => setLnk(null)}>Cancel</button></div>
            </form>
          )}
          {links.filter(vis).length === 0 ? <Empty title="No tracking links" body="Create a link to get an opaque URL for a campaign and channel." /> : links.filter(vis).map((l) => (
            <div key={l.id} className={card + ' space-y-2'} data-testid={`link-${l.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-medium">{l.campaign} <span className="font-normal text-muted-foreground">via {l.channel}</span> <Pill tone={l.active ? ACTIVE : ARCHIVED}>{l.active ? 'Active' : 'Archived'}</Pill></p>
                  <p className="text-xs text-muted-foreground">{srcName(l.source_id)} · lands on {pages.find((p) => p.id === l.page_id)?.label ?? l.page_id}</p>
                  <code className="mt-1 block truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={linkUrl(l.code)}>{linkUrl(l.code)}</code></div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => copy(l.code)} data-testid={`button-copy-${l.id}`}>Copy link</button>
                  {superAdmin && <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => setLnk({ id: l.id, sourceId: l.source_id, campaign: l.campaign, channel: l.channel, page: l.page_id, active: l.active })}>Edit</button>}
                  {toggle(l.active, () => saveLnk.mutate({ id: l.id, sourceId: l.source_id, campaign: l.campaign, channel: l.channel, page: l.page_id, active: !l.active }), saveLnk.isPending)}
                  {auditBtn(l.id)}
                </div>
              </div>
              {audit === l.id && <Audit id={l.id} onClose={() => setAudit(null)} />}
            </div>
          ))}
        </section>
      )}

      {tab === 'pages' && (
        <section className="space-y-3">
          {superAdmin && !pg && <button className={btn} onClick={() => setPg({ id: '', path: '/', label: '', funnel: 'website', active: true, isNew: true })} data-testid="button-new-page">Register page</button>}
          {pg && (
            <form className={card + ' grid gap-3 sm:grid-cols-2'} onSubmit={(e) => { e.preventDefault(); savePg.mutate({ id: pg.id, path: pg.path, label: pg.label.trim(), funnel: pg.funnel, active: pg.active }) }}>
              <Field label="Page id" hint="Lowercase letters, numbers, dashes"><input required pattern="[a-z][a-z0-9-]{0,63}" disabled={!pg.isNew} className={inp} value={pg.id} onChange={(e) => setPg({ ...pg, id: e.target.value })} data-testid="input-page-id" /></Field>
              <Field label="Label"><input required maxLength={100} className={inp} value={pg.label} onChange={(e) => setPg({ ...pg, label: e.target.value })} /></Field>
              <Field label="Path" hint="Public first-party path only"><input required maxLength={150} className={inp} value={pg.path} onChange={(e) => setPg({ ...pg, path: e.target.value })} data-testid="input-page-path" /></Field>
              <Field label="Funnel"><input required pattern="[a-z][a-z0-9-]{0,63}" className={inp} value={pg.funnel} onChange={(e) => setPg({ ...pg, funnel: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pg.active} onChange={(e) => setPg({ ...pg, active: e.target.checked })} />Active</label>
              <div className="flex gap-2 sm:col-span-2"><button className={btn} disabled={savePg.isPending} data-testid="button-save-page">{savePg.isPending ? 'Saving...' : 'Save page'}</button><button type="button" className={btn2} onClick={() => setPg(null)}>Cancel</button></div>
            </form>
          )}
          {pages.filter(vis).length === 0 ? <Empty title="No registered pages" body="Links can only point at active registered pages." /> : (
            <div className={card + ' divide-y divide-border p-0'}>{pages.filter(vis).map((p) => (
              <div key={p.id} className="space-y-2 p-4" data-testid={`page-${p.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-medium">{p.label} <Pill tone={p.active ? ACTIVE : ARCHIVED}>{p.active ? 'Active' : 'Archived'}</Pill></p><p className="font-mono text-xs text-muted-foreground">{p.path} · {p.id} · funnel {p.funnel}</p></div>
                  <div className="flex gap-1.5">
                    {superAdmin && <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => setPg({ id: p.id, path: p.path, label: p.label, funnel: p.funnel, active: p.active })}>Edit</button>}
                    {toggle(p.active, () => savePg.mutate({ id: p.id, path: p.path, label: p.label, funnel: p.funnel, active: !p.active }), savePg.isPending)}
                    {auditBtn(p.id)}
                  </div>
                </div>
                {audit === p.id && <Audit id={p.id} onClose={() => setAudit(null)} />}
              </div>
            ))}</div>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section className={card + ' max-w-xl space-y-4'}>
          {!settings ? <p className="text-sm text-muted-foreground">Settings row is missing.</p> : (() => {
            const v = set ?? { attribution_days: settings.attribution_days, session_minutes: settings.session_minutes, retention_days: settings.retention_days }
            const f = (k: string, l: string, min: number, max: number, hint: string) => (
              <Field label={l} hint={`${hint} (${min}-${max})`}><input type="number" min={min} max={max} disabled={!superAdmin} className={inp} value={v[k]} onChange={(e) => setSet({ ...v, [k]: e.target.value })} data-testid={`input-${k}`} /></Field>)
            return (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveSet.mutate({ attribution_days: Number(v.attribution_days), session_minutes: Number(v.session_minutes), retention_days: Number(v.retention_days) }) }}>
                {f('attribution_days', 'Attribution window (days)', 1, 365, 'How long a touch can claim a conversion')}
                {f('session_minutes', 'Session timeout (minutes)', 5, 120, 'Idle gap that starts a new session')}
                {f('retention_days', 'Retention (days)', 1, 730, 'Behavioral data older than this is purged')}
                {superAdmin && <div className="flex flex-wrap gap-2"><button className={btn} disabled={!set || saveSet.isPending} data-testid="button-save-settings">{saveSet.isPending ? 'Saving...' : 'Save settings'}</button>
                  {set && <button type="button" className={btn2} onClick={() => setSet(null)}>Discard</button>}{auditBtn('marketing')}</div>}
              </form>
            )
          })()}
          {audit === 'marketing' && <Audit id="marketing" onClose={() => setAudit(null)} />}
        </section>
      )}
    </div>
  )
}
