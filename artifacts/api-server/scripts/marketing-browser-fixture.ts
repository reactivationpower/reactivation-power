/** Disposable local business fixtures. Never calls GHL, Stripe or email delivery. */
import { randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { pool } from '@workspace/db'
import { getAdminClient } from '@/lib/supabase/admin'
import { intake } from '@/lib/sales-leads/store'
import { associate,identity,trustedConversion } from '@/lib/marketing/store'
import { createBookingConfirmation } from '@/lib/booking-confirmation'
const file='/tmp/marketing-browser-fixture.json',command=process.argv[2],supabase=getAdminClient()
try{
  if(command==='create'){
    const id=randomUUID(),email=`analytics-${id}@example.invalid`,password=randomUUID()+'Aa1!'
    const result=await supabase.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{admin_role:'super_admin',admin_active:true},user_metadata:{full_name:'Analytics Fixture'}})
    if(result.error||!result.data.user)throw new Error('Fixture admin creation failed')
    const data:any={id,email,password,adminId:result.data.user.id}
    writeFileSync(file,JSON.stringify(data),{mode:0o600})
    const lead=await intake({firstName:'Analytics',lastName:'Fixture',practiceName:'Disposable Analytics Fixture',email,phone:`+1999${Date.now().toString().slice(-7)}`,source:'test_fixture',
      sourcePath:'/analytics-test',dedupeKey:`analytics-fixture:${id}`,historical:true,submittedAt:new Date().toISOString(),context:{},consent:false,consentEvidence:{}})
    data.leadId=lead.id;writeFileSync(file,JSON.stringify(data),{mode:0o600})
    console.log('Fixture created. Private login details are in the fixture file.')
  }else{
    const data=JSON.parse(readFileSync(file,'utf8'))
    if(command==='confirmation'){
      data.confirmationToken=createBookingConfirmation('2026-10-13T14:00:00.000Z','America/Chicago')
      writeFileSync(file,JSON.stringify(data),{mode:0o600})
      console.log('Synthetic confirmation token stored privately. No booking created.')
    }else if(command==='associate'){
      const raw=readFileSync('/tmp/marketing-browser-cookie','utf8').trim()
      const visitor=await identity(raw)
      if(!visitor)throw new Error('No valid consented browser identity')
      await pool.query("UPDATE marketing_visitors SET classification='test' WHERE id=$1",[visitor.id])
      data.visitorId=visitor.id;writeFileSync(file,JSON.stringify(data),{mode:0o600})
      await associate(raw,data.leadId,`fixture:${data.id}`)
      await trustedConversion(pool,{id:`booking:fixture:${data.id}`,kind:'booking',leadId:data.leadId,at:new Date()})
      console.log('Local confirmed lead and booking fixtures recorded; no provider called.')
    }else if(command==='cleanup'){
      await pool.query('DELETE FROM marketing_conversions WHERE lead_id=$1',[data.leadId])
      await pool.query('DELETE FROM marketing_visitors WHERE lead_id=$1 OR id=$2',[data.leadId,data.visitorId??null])
      for(const table of ['sales_jobs','sales_activities','sales_submissions']){
        await pool.query(`DELETE FROM ${table} WHERE lead_id=$1 AND EXISTS(SELECT 1 FROM sales_leads WHERE id=$1 AND source='test_fixture')`,[data.leadId])
      }
      await pool.query('DELETE FROM sales_leads WHERE id=$1 AND source=$2',[data.leadId,'test_fixture'])
      if(data.sourceId){
        await pool.query('DELETE FROM marketing_links WHERE source_id=$1',[data.sourceId])
        await pool.query('DELETE FROM marketing_sources WHERE id=$1',[data.sourceId])
      }
      await pool.query('DELETE FROM marketing_audit WHERE actor=$1',[data.adminId])
      await supabase.auth.admin.deleteUser(data.adminId)
      console.log('Disposable analytics fixtures removed.')
    }
  }
}finally{await pool.end()}
