import { useState } from 'react'
import { Link, useParams } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as R from '@/app/actions/resellers'
import * as RO from '@/app/actions/reseller-onboarding'
import { AdminOnboardingPanel, type OnboardingPanelApi } from '@/components/affiliates/admin-onboarding-panel'
import { Section, StatusPill, Table, btn2Cls, dollarsToCents, fmtDate, inputCls, money, newKey, Field } from '@/components/affiliates/shared'
import { Finance, InviteResult, QueryError, RForm, Skeleton, TF } from '@/components/resellers/ui'

const onboardingApi: OnboardingPanelApi = {
  get: RO.getAdminOnboarding,
  review: (companyId, version) => RO.reviewOnboarding({ companyId, version }),
  reveal: (companyId, version) => RO.revealOnboardingWire({ companyId, version }),
  w9: (companyId, version) => RO.downloadOnboardingW9({ companyId, version }),
}

export default function AdminResellerProfilePage() {
  const { id = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['reseller-company', id], queryFn: () => R.getCompany(id), placeholderData: (p) => p, staleTime: 0, refetchOnMount: 'always' })
  const refresh = async (msg: string) => {
    toast.success(msg)
    await Promise.all([qc.invalidateQueries({ queryKey: ['reseller-company', id] }), qc.invalidateQueries({ queryKey: ['resellers'] }), qc.invalidateQueries({ queryKey: ['reseller-workspace'] })])
  }
  const [inv, setInv] = useState({ name: '', email: '', role: 'reseller_salesperson' as R.Role, reason: '' })
  const [invResult, setInvResult] = useState<unknown>(null)
  const [resent, setResent] = useState<Record<string, unknown>>({})
  const [memberReason, setMemberReason] = useState('')
  const [term, setTerm] = useState({ reason: '', confirm: false })
  const [led, setLed] = useState({ amount: '', reason: '', key: newKey() })
  const [wire, setWire] = useState({ period: '', amount: '', date: '', ref: '', key: newKey() })
  const [conflict, setConflict] = useState({ prospectId: '', customerId: '', reason: '' })

  const d = q.data
  if (q.isLoading) return <Skeleton />
  if (q.isError || !d) return <QueryError error={q.error} onRetry={() => q.refetch()} busy={q.isFetching} />
  const ended = Boolean(d.company.terminated_at)
  const unpaid = d.report.balance_cents
  const selPeriod = d.report.periods.find((x) => x.period === wire.period)

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/resellers" className="text-sm text-muted-foreground underline">All resellers</Link>
        <h1 className="mt-1 text-2xl font-semibold" data-testid="text-company-name">{d.company.business_name}</h1>
        <p className="text-sm text-muted-foreground">{d.company.email} | {ended ? `relationship ended ${fmtDate(d.company.terminated_at!)}` : 'active'}</p>
        {ended && <p className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">Relationship ended. No new earnings accrue. Earned unpaid balances stay payable, and refund clawbacks continue to apply.</p>}
      </header>

      <Finance report={d.report} payoutAction={(p) => (
        <button className={btn2Cls} data-testid={`button-retry-notify-${p.id}`} onClick={async () => { try { const r = await R.retryPayoutNotification(p.id); await refresh(r.emailSent ? 'Notification sent' : 'Notification still not sent') } catch (e) { toast.error((e as Error).message) } }}>Retry email</button>
      )} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>section]:min-w-0">
        <Section title="Team" desc="Managers see company finance and payment details. Salespeople see only their own prospects. Invite links work even if the email fails.">
          <Table empty="No members yet. Invite the first manager below."
            head={['Member', 'Role', 'Status', 'Actions']}
            rows={d.members.map((m) => [<span>{m.name}<span className="block text-xs text-muted-foreground">{m.email}</span></span>, m.role === 'reseller_manager' ? 'Manager' : 'Salesperson', <StatusPill s={m.active ? 'active' : 'inactive'} />,
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {m.active && !ended && <button className={btn2Cls} data-testid={`button-resend-${m.user_id}`} onClick={async () => { try { const r = await R.resendMemberInvite(m.user_id); setResent((x) => ({ ...x, [m.user_id]: r })); toast.success('Invitation sent') } catch (e) { toast.error((e as Error).message) } }}>Resend</button>}
                  <button className={btn2Cls} data-testid={`button-toggle-${m.user_id}`} onClick={async () => {
                    if (!memberReason.trim()) { toast.error('Enter a reason below the table first'); return }
                    try { await R.setMemberActive({ userId: m.user_id, active: !m.active, reason: memberReason.trim() }); await refresh(m.active ? 'Member deactivated' : 'Member reactivated') } catch (e) { toast.error((e as Error).message) }
                  }}>{m.active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
                <InviteResult result={resent[m.user_id]} />
              </div>])} />
          <div className="mt-3"><TF l="Reason for status changes (audited)" v={memberReason} set={setMemberReason} id="input-member-reason" req={false} /></div>
          {!ended && (
            <div className="mt-5 border-t border-border pt-4">
              <RForm testid="button-invite" submit="Send invitation" onSubmit={async () => { const r = await R.inviteMember({ companyId: id, name: inv.name.trim(), email: inv.email.trim(), role: inv.role, reason: inv.reason.trim() }); setInvResult(r); setInv({ ...inv, name: '', email: '', reason: '' }); await refresh('Invitation created') }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TF l="Name" v={inv.name} set={(v) => setInv({ ...inv, name: v })} id="input-invite-name" />
                  <TF l="Email" t="email" v={inv.email} set={(v) => setInv({ ...inv, email: v })} id="input-invite-email" />
                </div>
                <Field label="Role"><select className={inputCls} value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as R.Role })} data-testid="select-invite-role"><option value="reseller_manager">Manager</option><option value="reseller_salesperson">Salesperson</option></select></Field>
                <TF l="Reason (audited)" v={inv.reason} set={(v) => setInv({ ...inv, reason: v })} id="input-invite-reason" />
              </RForm>
              <div className="mt-3"><InviteResult result={invResult} /></div>
            </div>
          )}
        </Section>

        <AdminOnboardingPanel affiliateId={id} api={onboardingApi} />

        <Section title="Ledger correction" desc="Signed amount in dollars; negative reduces earnings. The request key prevents double posting.">
          <RForm testid="button-ledger" submit="Post correction" onSubmit={async () => { await R.adjustLedger({ companyId: id, cents: dollarsToCents(led.amount), reason: led.reason.trim(), key: led.key }); setLed({ amount: '', reason: '', key: newKey() }); await refresh('Correction posted') }}>
            <TF l="Signed amount (USD)" h="e.g. -25.00 or 40.50" v={led.amount} set={(v) => setLed({ ...led, amount: v })} id="input-led-amount" />
            <TF l="Reason" v={led.reason} set={(v) => setLed({ ...led, reason: v })} id="input-led-reason" />
            <TF l="Request key" v={led.key} set={(v) => setLed({ ...led, key: v })} id="input-led-key" />
          </RForm>
        </Section>

        <Section title="Record wire sent" desc="Record only a wire you already sent outside this system. This does not move money.">
          <RForm testid="button-wire" submit="Record wire" onSubmit={async () => { const r = await R.recordPayout({ companyId: id, period: wire.period, amountCents: dollarsToCents(wire.amount), paymentDate: wire.date, reference: wire.ref.trim(), key: wire.key }); setWire({ period: '', amount: '', date: '', ref: '', key: newKey() }); await refresh(r?.emailSent === false ? 'Wire recorded; notification not sent, retry from the payments table' : 'Wire recorded') }}>
            <Field label="Period"><select required className={inputCls} value={wire.period} onChange={(e) => setWire({ ...wire, period: e.target.value })} data-testid="select-wire-period"><option value="">Select period</option>{d.report.periods.map((x) => <option key={x.period} value={x.period}>{x.period} - available to wire {money(x.wireable_cents)}</option>)}</select></Field>
            {selPeriod && <p className="text-xs text-muted-foreground">Earned {money(selPeriod.earned_cents)}, paid {money(selPeriod.paid_cents)}, available {money(selPeriod.wireable_cents)}.</p>}
            <TF l="Actual amount sent (USD)" v={wire.amount} set={(v) => setWire({ ...wire, amount: v })} id="input-wire-amount" />
            <TF l="Actual payment date" t="date" v={wire.date} set={(v) => setWire({ ...wire, date: v })} id="input-wire-date" />
            <TF l="Bank reference" v={wire.ref} set={(v) => setWire({ ...wire, ref: v })} id="input-wire-ref" />
            <TF l="Request key" v={wire.key} set={(v) => setWire({ ...wire, key: v })} id="input-wire-key" />
          </RForm>
        </Section>

        <Section title="Customer identity conflict" desc="Link an existing customer to a reviewed prospect when their emails match. Historical earnings never change; only future offers are affected.">
          <RForm testid="button-resolve-conflict" submit="Resolve conflict" onSubmit={async () => { await R.resolveCustomerConflict(conflict); setConflict({ prospectId: '', customerId: '', reason: '' }); await refresh('Identity resolved') }}>
            <Field label="Prospect"><select required className={inputCls} value={conflict.prospectId} onChange={(e) => setConflict({ ...conflict, prospectId: e.target.value })} data-testid="select-conflict-prospect"><option value="">Select prospect</option>{d.prospects.map((p) => <option key={p.id} value={p.id}>{p.full_name} - {p.business_name} ({p.email})</option>)}</select></Field>
            <TF l="Customer ID" v={conflict.customerId} set={(v) => setConflict({ ...conflict, customerId: v })} id="input-conflict-customer" />
            <TF l="Reason" v={conflict.reason} set={(v) => setConflict({ ...conflict, reason: v })} id="input-conflict-reason" />
          </RForm>
        </Section>

        {!ended && (
          <Section title="End relationship" desc="Audited and not reversible here.">
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-terminate-warning">
              <p className="font-medium">What ending the relationship does</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Future earnings stop and selling access ends for every member.</li>
                <li>Earned unpaid balance ({money(unpaid)} now) is preserved and still payable.</li>
                <li>Refund clawbacks on past sales continue to apply.</li>
              </ul>
            </div>
            <RForm tone="danger" testid="button-terminate" submit="End relationship" onSubmit={async () => { if (!term.confirm) throw new Error('Confirm that you understand the effects.'); await R.terminateCompany(id, term.reason.trim()); setTerm({ reason: '', confirm: false }); await refresh('Relationship ended') }}>
              <TF l="Reason (audited)" v={term.reason} set={(v) => setTerm({ ...term, reason: v })} id="input-terminate-reason" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={term.confirm} onChange={(e) => setTerm({ ...term, confirm: e.target.checked })} data-testid="check-terminate" />I understand unpaid earnings are preserved and clawbacks continue.</label>
            </RForm>
          </Section>
        )}
      </div>

      <Section title="Prospects" desc="Everything the team is working, newest activity first.">
        <Table empty="No prospects yet." head={['Prospect', 'Business', 'Stage', 'Updated']}
          rows={d.prospects.map((p) => [<span>{p.full_name}<span className="block text-xs text-muted-foreground">{p.email}</span></span>, p.business_name, <StatusPill s={p.stage} />, fmtDate(p.updated_at)])} />
      </Section>
      <Section title="Audit activity" desc="Notes, call outcomes and owner actions. Financial and audit records are retained.">
        <Table empty="No activity recorded." head={['When', 'Action', 'Outcome', 'Next follow-up', 'Reason']}
          rows={d.activity.map((a) => [fmtDate(a.occurred_at), a.action.replace(/_/g, ' '),
            a.details?.disposition ?? '-', a.details?.nextFollowupAt ? fmtDate(a.details.nextFollowupAt) : '-', a.reason ?? '-'])} />
      </Section>
    </div>
  )
}
