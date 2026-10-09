import { pool } from '@workspace/db'
import { reconcileMarketing } from '@/lib/marketing/reconcile'
import { marketingReport } from '@/lib/marketing/report'
try{
  console.log(await reconcileMarketing())
  const result=await marketingReport({role:'super_admin',userId:'maintenance'},{})
  console.log({reportReadable:true,visitors:result.totals.visitors,currencyGroups:result.revenue.length})
}catch(error:any){console.error({code:error.code,message:error.message});process.exitCode=1}
finally{await pool.end()}
