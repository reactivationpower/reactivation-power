import { pool } from '@workspace/db'
import { readFileSync } from 'node:fs'
const journal=JSON.parse(readFileSync(new URL('../../../lib/db/migrations/meta/_journal.json',import.meta.url),'utf8'))
const entry=journal.entries.find((e:{tag:string})=>e.tag==='0032_marketing_analytics')
const rows=await pool.query('SELECT max(created_at) AS latest FROM drizzle.__drizzle_migrations')
const exists=(await pool.query("SELECT to_regclass('public.marketing_events') AS events")).rows[0].events
process.stdout.write(JSON.stringify({pendingTimestamp:entry?.when,appliedHighWater:Number(rows.rows[0].latest),alreadyExists:Boolean(exists)})+'\n')
if(process.argv.includes('--validate')&&!exists){
  const c=await pool.connect()
  try{
    await c.query('BEGIN')
    await c.query(readFileSync(new URL('../../../lib/db/migrations/0032_marketing_analytics.sql',import.meta.url),'utf8'))
    console.log('DDL validation passed (rolled back)')
  }catch(error:any){console.log({code:error.code,message:error.message});process.exitCode=1}
  finally{await c.query('ROLLBACK');c.release()}
}
await pool.end()
