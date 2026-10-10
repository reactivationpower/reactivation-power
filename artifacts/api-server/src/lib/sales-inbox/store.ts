import { randomBytes } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { ReplitConnectors } from '@replit/connectors-sdk'
type Client = Pick<PoolClient, 'query'>
export async function inboxSettings(c: Client = pool) {
  await c.query("INSERT INTO sales_inbox_settings(id) VALUES('internal') ON CONFLICT DO NOTHING")
  return (await c.query("SELECT * FROM sales_inbox_settings WHERE id='internal'")).rows[0]
}
export async function replyAddress(leadId: string, c: Client = pool) {
  const cfg = await inboxSettings(c)
  if (!cfg.email_ready || !cfg.email_domain) throw new Error('Email receiving setup is not ready')
  await c.query('INSERT INTO sales_inbox_threads(lead_id,token) VALUES($1,$2) ON CONFLICT DO NOTHING', [leadId, randomBytes(24).toString('hex')])
  const row = (await c.query('SELECT token FROM sales_inbox_threads WHERE lead_id=$1', [leadId])).rows[0]
  return `${row.token}@${cfg.email_domain}`
}
export async function receivingApi(path: string) {
  const key = process.env.RESEND_RECEIVING_API_KEY
  const response = key
    ? await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) })
    : await new ReplitConnectors().proxy('resend', path, { method: 'GET' })
  if (!response.ok) throw new Error('Resend receiving API access unavailable')
  return response.json()
}
export async function receivingAccess() {
  try { await receivingApi('/emails/receiving?limit=1'); return true } catch { return false }
}
export function mailbox(value: unknown) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (raw.match(/<([^<>]+)>$/)?.[1] ?? raw).trim()
}
