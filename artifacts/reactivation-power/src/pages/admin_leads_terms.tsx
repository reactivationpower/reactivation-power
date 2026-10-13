import { useState } from 'react'
import { Link } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { loadPage } from '@/lib/api'
import { publishTerms, saveTermsDraft, type TermsAdmin } from '@/app/actions/lead-terms'
import { canonicalTerms } from '@workspace/shared/lead-terms'
import { Banner, ErrorBox, Field, LeadsTabs, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp, useDashboard } from '@/components/leads/ui'

export default function AdminLeadsTermsPage() {
  const qc = useQueryClient()
  const dash = useDashboard()
  const q = useQuery({ queryKey: ['sales-leads', 'terms'], queryFn: () => loadPage<TermsAdmin>('/admin/leads/terms') })
  const [edit, setEdit] = useState<{ content: string; label: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [ack, setAck] = useState(false)
  const done = (m: string) => { toast.success(m); setEdit(null); setConfirm(false); setAck(false); qc.invalidateQueries({ queryKey: ['sales-leads', 'terms'] }) }
  const save = useMutation({ mutationFn: (input: Parameters<typeof saveTermsDraft>[0]) => saveTermsDraft(input), onSuccess: () => done('Draft saved'), onError: (e) => toast.error(errMsg(e)) })
  const publish = useMutation({ mutationFn: (input: Parameters<typeof publishTerms>[0]) => publishTerms(input), onSuccess: () => done('Terms published'), onError: (e) => toast.error(errMsg(e)) })

  if (q.isLoading || dash.isLoading) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Leads</h1><Skeleton rows={6} /></div>
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  if (dash.data && !dash.data.super_admin) return <Banner kind="info">Only super admins can manage Terms of Service.</Banner>
  const { current, draft, history } = q.data
  const content = edit?.content ?? draft.content
  const label = edit?.label ?? draft.label
  const dirty = edit !== null && (edit.content !== draft.content || edit.label !== draft.label)
  const canPublish = !dirty && canonicalTerms(draft.content).length > 0 && draft.label.trim().length > 0

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Terms of Service shown on marketing lead forms.</p></header>
      <LeadsTabs />
      <section className={card + ' space-y-2'} data-testid="section-terms-status">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Current status</h2>
          <Pill tone={current.active ? 'bg-success/15 text-success' : undefined}>{current.active ? 'Active' : 'Inactive'}</Pill></div>
        {current.active ? <p className="text-sm">Live version: <Link className="underline" href={`/terms/${current.version.id}`}>{current.version.label}</Link> (published {fmt(current.version.published_at)})</p>
          : <p className="text-sm text-muted-foreground">No terms are published. Lead forms work without a Terms checkbox. Publishing the first version adds the checkbox to every shared marketing lead form.</p>}
      </section>

      <section className={card + ' space-y-3'} data-testid="section-terms-editor">
        <h2 className="font-semibold">Draft</h2>
        <Banner kind="warn">Only paste an attorney-provided document. Nothing here is legal advice or generated for you.</Banner>
        <Field label="Version label"><input className={inp} value={label} onChange={(e) => setEdit({ content, label: e.target.value })} data-testid="input-terms-label" /></Field>
        <Field label="Terms text (plain text)"><textarea rows={14} className={inp + ' font-mono'} value={content} onChange={(e) => setEdit({ label, content: e.target.value })} data-testid="input-terms-content" /></Field>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview as visitors see it</p>
          <div className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="text-terms-preview">{canonicalTerms(content) || 'Nothing to preview yet.'}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={!dirty || !canonicalTerms(content) || !label.trim() || save.isPending} data-testid="button-save-terms-draft"
            onClick={() => save.mutate({ content, label: label.trim(), revision: draft.revision })}>{save.isPending ? 'Saving...' : 'Save draft'}</button>
          <button className={btn2} disabled={!canPublish || publish.isPending} onClick={() => setConfirm(true)} data-testid="button-publish-terms" title={dirty ? 'Save the draft before publishing' : undefined}>Publish...</button>
        </div>
        {dirty && <p className="text-xs text-muted-foreground">Save the draft before publishing.</p>}
        {confirm && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alertdialog" data-testid="dialog-publish-terms">
            <p className="font-medium">Publish "{draft.label}"?</p>
            <p>{current.active ? 'This replaces the live version for new submissions. Published versions can never be edited or deleted.' : 'This activates the Terms checkbox on every shared marketing lead form. Published versions can never be edited or deleted.'}</p>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="checkbox-confirm-publish" />
              <span>I confirm this text is an attorney-provided document.</span></label>
            <div className="flex gap-2">
              <button className={btn} disabled={!ack || publish.isPending} onClick={() => publish.mutate({ revision: draft.revision, confirm: true })} data-testid="button-confirm-publish">{publish.isPending ? 'Publishing...' : 'Publish now'}</button>
              <button className={btn2} onClick={() => { setConfirm(false); setAck(false) }}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className={card + ' space-y-3'} data-testid="section-terms-history">
        <h2 className="font-semibold">History (immutable)</h2>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">No versions published yet.</p> : (
          <ul className="divide-y divide-border">{history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`terms-version-${h.id}`}>
              <div><p className="font-medium">{h.label}</p><p className="text-xs text-muted-foreground">Published {fmt(h.published_at)} · hash {h.content_hash.slice(0, 12)}</p></div>
              <Link className={btn2} href={`/terms/${h.id}`}>View</Link>
            </li>))}</ul>
        )}
      </section>
    </div>
  )
}
