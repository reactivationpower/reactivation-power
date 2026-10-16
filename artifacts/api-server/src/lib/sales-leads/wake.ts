import { settings, transaction } from './store'
import { isVercel, isVercelPreview } from '../deployment-safety'

export const NATIVE_WAKE_HEADER = 'x-patient-pipeline-scheduler'
export const NATIVE_WAKE_MARKER = 'supabase-sales-v1'
export const NATIVE_WAKE_JOB = 'patientpipeline-internal-sales-five-minute'
const VAULT_NAME = 'patientpipeline_internal_sales_cron'

/** Only the deployment-verified first-party URL may receive the existing secret. */
export function nativeWakeCommand(target: string) {
  const url = new URL(target)
  if (url.protocol !== 'https:' || url.hostname !== 'patientpipeline.app' || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/api/cron/sales-leads') {
    throw new Error('Sales wakeups require the verified https://patientpipeline.app/api/cron/sales-leads endpoint')
  }
  return `SET http.curlopt_timeout_ms='240000';
  SET http.curlopt_connecttimeout_ms='15000';
  SET http.curlopt_ssl_verifypeer='1';
  SET http.curlopt_ssl_verifyhost='2';
  SELECT status FROM extensions.http((
    'GET','https://patientpipeline.app/api/cron/sales-leads',
    ARRAY[extensions.http_header('Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='${VAULT_NAME}')),
      extensions.http_header('${NATIVE_WAKE_HEADER}','${NATIVE_WAKE_MARKER}')],
    NULL,NULL
  )::extensions.http_request);`
}

/** One copy shared with the web app's automation checklist. */
export { schedulerHealthy } from '@workspace/shared/sales-automation'

/** Operator provisioning, not a public/RPC action. Never return decrypted secrets. */
export async function configureNativeWake(target: string) {
  const command = nativeWakeCommand(target)
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('The existing CRON_SECRET must be configured in this environment')
  return transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('internal-sales-native-wake',0))")
    await c.query("SELECT id FROM sales_settings WHERE id='internal' FOR UPDATE")
    const cfg = await settings(c)
    if (cfg.automation_enabled) throw new Error('Disable sales SMS automation before changing its scheduler')
    const existing = (await c.query('SELECT id FROM vault.secrets WHERE name=$1 LIMIT 1',[VAULT_NAME])).rows[0]
    // Bound parameters over TLS; no token in migrations, job text, URLs or logs.
    if (existing) await c.query('SELECT vault.update_secret($1::uuid,$2)',[existing.id,secret])
    else await c.query('SELECT vault.create_secret($1,$2,$3)',[secret,VAULT_NAME,'Existing cron bearer for internal sales wakeups'])
    const jobId = (await c.query('SELECT cron.schedule($1,$2,$3) AS id',[NATIVE_WAKE_JOB,'*/5 * * * *',command])).rows[0].id
    const capabilities = {
      native_scheduler: { state:'configured',jobId,requirement:`Supabase job ${jobId}: every five minutes to ${target}. Uses encrypted Vault authentication; no publishing or SMS activation.` },
      scheduler_wake: { state:'pending',requirement:'Waiting for the first healthy scheduled wake on the published app. Automation cannot be enabled before this.',checkedAt:null },
    }
    await c.query("UPDATE sales_settings SET capabilities=capabilities||$1::jsonb WHERE id='internal'",[JSON.stringify(capabilities)])
    return { jobId, schedule:'*/5 * * * *', target, automationEnabled:false }
  })
}

/**
 * Dev/manual requests cannot establish production scheduler readiness.
 *
 * Two schedulers can feed the one `scheduler_wake` capability the shared
 * readiness rule list reads (lib/shared/src/sales-automation.ts): the
 * Supabase pg_cron job on Replit, and Vercel Cron on Vercel. Each stamps the
 * same capability with its `source`, so the checklist's "Scheduler running"
 * row is true whenever *a* scheduler woke the published worker in the last
 * ten minutes and never needs a second rule. After the Vercel cutover the
 * pg_cron job is retired (retireNativeWake) so the two do not both wake the
 * worker; while both exist, overlapping wakes are safe (durable claims).
 */
export async function recordNativeWake() {
  if (process.env.NODE_ENV !== 'production' || isVercelPreview()) return
  await transaction(async c => {
    const cfg = await settings(c)
    const jobId = cfg.capabilities.native_scheduler?.jobId
    if (!jobId) return
    const active = (await c.query("SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobid=$1 AND jobname=$2 AND active AND schedule='*/5 * * * *') AS active",[jobId,NATIVE_WAKE_JOB])).rows[0].active
    const wake = { state:active ? 'verified' : 'missing',checkedAt:new Date().toISOString(),source:'supabase',
      requirement:active ? 'Healthy authenticated Supabase wake received by the published worker. Last success is shown below.' : 'The configured five-minute Supabase cron job is not active. Keep automation off.' }
    await c.query("UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{scheduler_wake}',$1::jsonb) WHERE id='internal'",[JSON.stringify(wake)])
  })
}

/** A Vercel Cron call of the five-minute route on the Vercel production deployment. */
export async function recordVercelCronWake() {
  if (process.env.NODE_ENV !== 'production' || !isVercel() || isVercelPreview()) return
  await transaction(async c => {
    const wake = { state:'verified',checkedAt:new Date().toISOString(),source:'vercel-cron',
      requirement:'Healthy authenticated Vercel Cron wake received by the published worker. Last success is shown below.' }
    await c.query("UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{scheduler_wake}',$1::jsonb) WHERE id='internal'",[JSON.stringify(wake)])
  })
}

/**
 * Cutover step (operator-run, after Vercel Cron is live): unschedule the
 * Supabase pg_cron wake so the worker is not woken twice. The Vault secret
 * is kept. Not called by any route.
 */
export async function retireNativeWake() {
  return transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('internal-sales-native-wake',0))")
    await c.query("SELECT id FROM sales_settings WHERE id='internal' FOR UPDATE")
    const cfg = await settings(c)
    const jobId = cfg.capabilities.native_scheduler?.jobId
    if (jobId) await c.query('SELECT cron.unschedule($1::bigint)',[jobId]).catch(() => undefined)
    const native = { state:'retired',jobId:null,requirement:'Retired: Vercel Cron calls /api/cron/workers every five minutes instead.' }
    await c.query("UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{native_scheduler}',$1::jsonb) WHERE id='internal'",[JSON.stringify(native)])
    return { retiredJobId: jobId ?? null }
  })
}
