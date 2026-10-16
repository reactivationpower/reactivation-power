/**
 * Read-only launch evidence. Never invokes workers, sends, or changes settings.
 * Prints only aggregate configuration/capability facts, not contact data or keys.
 * Run from the workspace: node artifacts/api-server/scripts/conversation-readiness.mjs
 */
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolveMx } from 'node:dns/promises'

const result = { checkedAt: new Date().toISOString() }
const raw = new URL(process.env.SUPABASE_DB_URL)
raw.searchParams.delete('sslmode')
const db = new pg.Client({ connectionString: raw.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 10000 })
async function ghl(path) {
  const response = await fetch(`https://services.leadconnectorhq.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.GHL_API_TOKEN}`, Version: '2021-07-28' },
    redirect: 'manual', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) { await response.body?.cancel(); return { status: response.status } }
  return { status: response.status, data: await response.json() }
}
try {
  await db.connect()
  await db.query('BEGIN READ ONLY')
  const journal = JSON.parse(readFileSync(new URL('../../../lib/db/migrations/meta/_journal.json', import.meta.url), 'utf8')).entries
  const applied = (await db.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations')).rows
  const pending = journal.filter(e => {
    const sql = readFileSync(new URL(`../../../lib/db/migrations/${e.tag}.sql`, import.meta.url), 'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    return !applied.some(a => a.hash === hash)
  })
  result.migrations = { journalEntries: journal.length, hashDifferences: pending.map(e => ({
    tag: e.tag, timestampRecorded: applied.some(a => Number(a.created_at) === e.when),
  })),
    aboveDatabaseHighWater: journal.filter(e => e.when > Math.max(...applied.map(a => Number(a.created_at)))).map(e => e.tag),
    uniqueTags: new Set(journal.map(e => e.tag)).size === journal.length,
    monotonic: journal.every((e,i) => e.idx === i && (!i || e.when > journal[i-1].when)) }
  result.requiredSchema = (await db.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND
      ((table_name='campaign_leads' AND column_name='source_submitted_at') OR
       (table_name='appointment_deliveries' AND column_name IN ('snapshot','email_log_id','provider_id')) OR
       (table_name='sales_inbox_messages' AND column_name IN ('fingerprint','provider_id','state')))
    ORDER BY table_name,column_name`)).rows
  const caps = (await db.query("SELECT capabilities FROM sales_settings WHERE id='internal'")).rows[0]?.capabilities ?? {}
  result.channels = {
    appointmentEmail: (await db.query("SELECT enabled FROM appointment_message_settings WHERE id='strategy'")).rows[0]?.enabled ?? false,
    automaticSms: caps.appointment_sms?.enabled === true,
    manualSms: (await db.query("SELECT sms_ready FROM sales_inbox_settings WHERE id='internal'")).rows[0]?.sms_ready ?? false,
    senderBoundToLocation: caps.portal_sms_sender?.locationId === process.env.GHL_LOCATION_ID && !!caps.portal_sms_sender?.number,
    activeHostCount: Number((await db.query('SELECT count(*) FROM appointment_hosts WHERE active=true')).rows[0].count),
    scheduler: { state: caps.scheduler_wake?.state ?? 'unknown', checkedAt: caps.scheduler_wake?.checkedAt ?? null },
  }
  // Probe only one already-known call. Do not enumerate or export conversations.
  const call = (await db.query("SELECT provider_id FROM sales_activities WHERE kind='provider_call' AND provider_id IS NOT NULL ORDER BY occurred_at DESC LIMIT 1")).rows[0]
  await db.query('ROLLBACK')
  await db.end()
  const location = encodeURIComponent(process.env.GHL_LOCATION_ID)
  const numbers = await ghl(`/phone-system/numbers/location/${location}?skipNumberPool=true`)
  result.ghlNumber = { status: numbers.status, count: numbers.data?.numbers?.length ?? null,
    singleSmsCapable: numbers.data?.numbers?.length === 1 && numbers.data.numbers[0].capabilities?.sms === true,
    pinnedSenderMatches: numbers.data?.numbers?.length === 1 && numbers.data.numbers[0].phoneNumber === caps.portal_sms_sender?.number }
  for (const [key,path] of [
    ['conversationRead', `/conversations/search?locationId=${location}&limit=1`],
    ['calendarRead', `/calendars/?locationId=${location}`],
    ['workflowRead', `/workflows/?locationId=${location}`],
  ]) {
    const r = await ghl(path)
    result[key] = { status: r.status }
    if (key === 'workflowRead') result[key].count = r.data?.workflows?.length ?? null
  }
  result.media = { checked: false, reason: 'No saved provider call available; real recording/transcript access not established.' }
  if (call && /^[A-Za-z0-9_-]{1,128}$/.test(call.provider_id)) {
    result.media = { checked: true }
    for (const [key,suffix] of [['recording','recording'],['transcript','transcription']]) {
      const r = await fetch(`https://services.leadconnectorhq.com/conversations/locations/${location}/messages/${call.provider_id}/${suffix}`, {
        headers: { Authorization: `Bearer ${process.env.GHL_API_TOKEN}`, Version: '2021-07-28' },
        redirect: 'manual', signal: AbortSignal.timeout(15000),
      })
      result.media[key] = { status: r.status, contentType: r.headers.get('content-type') }
      await r.body?.cancel() // Do not download private call content for a capability probe.
    }
  }
  try { const mx = await resolveMx('patientpipeline.app'); result.replyToMx = { present: mx.some(r => r.exchange && r.exchange !== '.'), count: mx.length } }
  catch (e) { result.replyToMx = { present: false, dnsError: e.code } }
  console.log(JSON.stringify(result, null, 2))
} catch (e) {
  // Avoid printing a driver error containing connection details.
  console.error('Read-only readiness probe failed:', e.code ?? e.name)
  process.exitCode = 1
} finally { await db.end().catch(() => {}) }
