import { useState } from 'react'
import { Link, useParams } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSale, retryEnrollment, resendAgreement } from '@/app/actions/resellers'
import { AgreementFormDialog } from '@/components/admin/agreement-form-dialog'
import { Section, btn2Cls, fmtDate, money } from '@/components/affiliates/shared'
import { QueryError, Skeleton } from '@/components/resellers/ui'

export default function ResellerCustomerPage() {
  const {id=''}=useParams<{id:string}>()
  const qc=useQueryClient()
  const q=useQuery({queryKey:['reseller-sale',id],queryFn:()=>getSale(id)})
  const [dialog,setDialog]=useState(false)
  const [busy,setBusy]=useState(false)
  if (q.isLoading) return <Skeleton />
  if (q.isError || !q.data) return <QueryError error={q.error} onRetry={()=>q.refetch()} busy={q.isFetching}/>
  const s=q.data.sale
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['reseller-sale',id]})}
  const run=async(fn:()=>Promise<any>)=>{
    setBusy(true)
    try {const r=await fn();if(r?.ok===false)throw new Error(r.error||r.invitation?.error||'Request could not be completed.')
      toast.success('Request saved');await refresh()
    } catch(e){toast.error((e as Error).message)} finally{setBusy(false)}
  }
  const unsigned=!/signed|completed|cancel|void|expire|supersed/i.test(s.agreement_status??'')
  return <div className="space-y-6">
    <Link href="/resellers" className="text-sm underline">Back to workspace</Link>
    <div><h1 className="text-2xl font-bold">{s.full_name}</h1><p className="text-muted-foreground">{s.business_name}</p></div>
    <Section title="Customer" desc="Customer information only. Practice and patient records are not accessible here.">
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Email</dt><dd>{s.email}</dd></div>
        <div><dt>Phone</dt><dd>{s.phone}</dd></div><div><dt>Business address</dt><dd>{s.business_address||'Not supplied'}</dd></div></dl>
    </Section>
    <Section title="Sale progress" desc="Patient Pipeline handles the agreement, payment and service. Communications are external and manual.">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt>Offer</dt><dd>{s.type==='one_time'?`Lifetime: ${money(s.amount_cents)}`:`Monthly: ${money(s.monthly_cents)}; setup: ${money(s.setup_fee_cents)}`}</dd></div>
        <div><dt>Enrollment</dt><dd>{s.completed_at?`Completed ${fmtDate(s.completed_at)}`:'Not completed'}</dd></div>
        <div><dt>Subscription</dt><dd>{s.subscription_status||'Not started'}</dd></div>
        <div><dt>Agreement</dt><dd>{s.agreement_status||'Not sent'}</dd></div>
        <div><dt>Next payment</dt><dd>{s.next_payment_at?fmtDate(s.next_payment_at):'Not scheduled'}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {!s.completed_at && <button className={btn2Cls} disabled={busy} onClick={()=>void run(()=>retryEnrollment(id))}>Retry saved enrollment</button>}
        {unsigned && <button className={btn2Cls} onClick={()=>setDialog(true)}>{s.agreement_id?'Edit unsigned agreement':'Send agreement'}</button>}
        {s.agreement_id && unsigned && <button disabled={busy} className={btn2Cls} onClick={()=>void run(()=>resendAgreement(s.agreement_id))}>Resend agreement</button>}
      </div>
    </Section>
    <AgreementFormDialog open={dialog} onOpenChange={setDialog} linkId={id} agreementId={s.agreement_id??undefined}
      mode={s.agreement_id?'edit':'send'} reseller onSaved={()=>void refresh()}/>
  </div>
}
